# Deploy Landing Page — Quick Guide

## Option 1: GitHub Pages (Free, Recommended)

1. Push this repo to GitHub (already done at github.com/muhaddasgujjar/Maiku_AI)
2. Go to **Settings → Pages** in your GitHub repo
3. Under "Source" choose **Deploy from a branch**
4. Select branch: `main`, folder: `/landing`
5. Click Save → your site will be live at:
   `https://muhaddasgujjar.github.io/Maiku_AI/`

## Option 2: Vercel (Also Free)

```bash
npm i -g vercel
cd landing
vercel --prod
```

## Option 3: Netlify Drop

1. Go to netlify.com/drop
2. Drag the `landing/` folder into the browser
3. Done — you get a live URL instantly

---

## Set Up Payments (Gumroad — Free)

1. Go to **gumroad.com** → Create account
2. Click **New Product → Digital Product**
3. Name: "Maiku AI Pro"
4. Price: $24
5. Add a description + your installer .exe as the file
6. Publish → copy the product URL
7. Replace the placeholder URLs in `landing/index.html`:
   - Search for `muhaddasgujjar.gumroad.com/l/maiku-ai-pro`
   - Replace with your actual Gumroad product URL

## Gumroad takes 10% fee — alternatives:
- **LemonSqueezy**: lemon.squeezy.com (5% fee, better UI)
- **Paddle**: paddle.com (handles global VAT automatically)
- **Ko-fi**: ko-fi.com (free for one-time payments)
