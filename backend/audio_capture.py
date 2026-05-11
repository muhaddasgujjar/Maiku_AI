"""
WASAPI loopback audio capture — captures system audio output (what you hear).
This lets us capture the interviewer's voice from Zoom/Teams/Meet.

Requires: PyAudioWPatch (pip install PyAudioWPatch)
Fallback: sounddevice if PyAudioWPatch is unavailable.
"""
import io
import logging
import struct
import threading
import wave
from typing import Callable, Optional

from config import AUDIO_SAMPLE_RATE, AUDIO_CHUNK_SECONDS, AUDIO_DEVICE_NAME

log = logging.getLogger('maiku.audio')

CHANNELS = 1
SAMPLE_WIDTH = 2  # 16-bit PCM

# RMS below this level (out of 32767) is treated as silence — skip Whisper call
SILENCE_RMS_THRESHOLD = 150


class AudioCapture:
    def __init__(self):
        self.is_running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    def start(self, on_chunk: Callable[[bytes], None]) -> None:
        if self.is_running:
            return
        self.is_running = True
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._capture_loop,
            args=(on_chunk,),
            daemon=True,
        )
        self._thread.start()
        log.info('Audio capture thread started')

    def stop(self) -> None:
        if not self.is_running:
            return
        self._stop_event.set()
        self.is_running = False
        if self._thread:
            self._thread.join(timeout=3)
        log.info('Audio capture stopped')

    def _capture_loop(self, on_chunk: Callable[[bytes], None]) -> None:
        try:
            self._capture_with_pyaudiowpatch(on_chunk)
        except ImportError:
            log.warning('PyAudioWPatch not available, trying sounddevice fallback')
            try:
                self._capture_with_sounddevice(on_chunk)
            except ImportError:
                log.error(
                    'No audio library available. '
                    'Install: pip install PyAudioWPatch\n'
                    'Or: pip install sounddevice'
                )

    def _capture_with_pyaudiowpatch(self, on_chunk: Callable[[bytes], None]) -> None:
        import pyaudiowpatch as pyaudio  # type: ignore

        pa = pyaudio.PyAudio()
        device_info = self._find_wasapi_loopback_device(pa)

        if not device_info:
            log.error('No WASAPI loopback device found. Is audio playing?')
            pa.terminate()
            return

        # Use the device's NATIVE rate — WASAPI loopback captures at hardware rate
        # (usually 44100 or 48000 Hz). Opening at a different rate causes corrupt audio.
        native_rate = int(device_info.get('defaultSampleRate', AUDIO_SAMPLE_RATE))
        native_channels = max(1, int(device_info.get('maxInputChannels', 2)))
        chunk_frames = native_rate * AUDIO_CHUNK_SECONDS

        log.info(
            'Capturing from: %s @ %d Hz, %d ch',
            device_info.get('name'), native_rate, native_channels,
        )

        stream = pa.open(
            format=pyaudio.paInt16,
            channels=native_channels,
            rate=native_rate,
            input=True,
            input_device_index=device_info['index'],
            frames_per_buffer=1024,
        )

        frames: list[bytes] = []
        total_frames = 0
        sample_width = pa.get_sample_size(pyaudio.paInt16)
        try:
            while not self._stop_event.is_set():
                data = stream.read(1024, exception_on_overflow=False)
                frames.append(data)
                total_frames += 1024

                if total_frames >= chunk_frames:
                    if not _is_silent(frames, native_channels):
                        wav_bytes = _frames_to_wav(frames, sample_width, native_rate, native_channels)
                        on_chunk(wav_bytes)
                    frames = []
                    total_frames = 0
        finally:
            stream.stop_stream()
            stream.close()
            pa.terminate()

    def _find_wasapi_loopback_device(self, pa) -> Optional[dict]:
        """Find the WASAPI loopback device paired with the default speakers."""
        import pyaudiowpatch as pyaudio  # type: ignore

        try:
            wasapi_info = pa.get_host_api_info_by_type(pyaudio.paWASAPI)
        except OSError:
            return None

        default_speakers_idx = wasapi_info.get('defaultOutputDevice', -1)
        if default_speakers_idx < 0:
            return None

        default_speakers = pa.get_device_info_by_index(default_speakers_idx)

        for i in range(pa.get_device_count()):
            device = pa.get_device_info_by_index(i)
            if (
                device.get('isLoopbackDevice')
                and device.get('name', '').startswith(default_speakers.get('name', ''))
            ):
                if AUDIO_DEVICE_NAME and AUDIO_DEVICE_NAME not in device['name']:
                    continue
                return device

        return None

    def _capture_with_sounddevice(self, on_chunk: Callable[[bytes], None]) -> None:
        import sounddevice as sd  # type: ignore
        import numpy as np

        device = None
        if AUDIO_DEVICE_NAME:
            devices = sd.query_devices()
            for i, d in enumerate(devices):
                if AUDIO_DEVICE_NAME.lower() in str(d['name']).lower():
                    device = i
                    break

        log.info('sounddevice capture (loopback may need virtual cable on Windows)')

        chunk_frames = AUDIO_SAMPLE_RATE * AUDIO_CHUNK_SECONDS
        buffer: list[bytes] = []
        buffer_frames = [0]

        def callback(indata, frames, time, status):
            if status:
                log.warning('sounddevice status: %s', status)
            pcm = (indata * 32767).astype(np.int16).tobytes()
            buffer.append(pcm)
            buffer_frames[0] += frames

            if buffer_frames[0] >= chunk_frames:
                if not _is_silent(buffer, channels=1):
                    wav_bytes = _frames_to_wav(buffer, SAMPLE_WIDTH, AUDIO_SAMPLE_RATE, 1)
                    on_chunk(wav_bytes)
                buffer.clear()
                buffer_frames[0] = 0

        with sd.InputStream(
            samplerate=AUDIO_SAMPLE_RATE,
            channels=1,
            dtype='float32',
            device=device,
            callback=callback,
        ):
            self._stop_event.wait()


# ── Module-level helpers (no self needed) ─────────────────────

def _frames_to_wav(
    frames: list[bytes],
    sample_width: int,
    frame_rate: int = AUDIO_SAMPLE_RATE,
    channels: int = CHANNELS,
) -> bytes:
    """Pack raw PCM frames into a WAV container (required by Groq Whisper API)."""
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(frame_rate)
        wf.writeframes(b''.join(frames))
    return buf.getvalue()


def _is_silent(frames: list[bytes], channels: int = 1) -> bool:
    """Return True if the audio energy is below the silence threshold."""
    pcm = b''.join(frames)
    count = len(pcm) // 2  # number of int16 samples (all channels interleaved)
    if count == 0:
        return True
    samples = struct.unpack_from(f'<{count}h', pcm)
    rms = (sum(s * s for s in samples) / count) ** 0.5
    return rms < SILENCE_RMS_THRESHOLD
