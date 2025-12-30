# Spotted 👁️

**Safer streets. Rewarded.**

A citizen-powered traffic violation reporting app. Report parking violations, earn rewards.

## Quick Start

### 1. Set Up Supabase (5 minutes)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** and give it a name (e.g., "spotted")
3. Wait for the project to be created (~2 minutes)
4. Once ready, go to **SQL Editor** in the left sidebar
5. Click **New Query** and paste the contents of `supabase-schema.sql`
6. Click **Run** to create all tables

### 2. Get Your API Keys

1. In Supabase, go to **Settings** → **API**
2. Copy these two values:
   - **Project URL** (looks like `https://xyz.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### 3. Set Up Photo Storage

1. In Supabase, go to **Storage** in the left sidebar
2. Click **New Bucket**
3. Name it exactly: `violation-photos`
4. Set it to **Public** (for demo) or Private (for production)
5. Click **Create**

### 4. Deploy to Vercel (2 minutes)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/spotted-app)

Or manually:

1. Push this code to a GitHub repo
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click **Add New** → **Project**
4. Import your repo
5. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
6. Click **Deploy**

### 5. Test It

1. Open your deployed URL
2. Create an account
3. Click "Spot a Violation" and upload a test photo
4. Check Supabase **Table Editor** → **reports** to see your data

---

## Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local

# Add your Supabase credentials to .env.local

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
spotted-app/
├── app/
│   ├── globals.css      # Tailwind + custom styles
│   ├── layout.js        # Root layout with fonts
│   └── page.js          # Main app component
├── lib/
│   └── supabase.js      # Supabase client + helpers
├── supabase-schema.sql  # Database schema (run in Supabase)
├── .env.local.example   # Environment template
└── package.json
```

---

## Database Schema

### Tables

- **profiles** - User data (extends Supabase auth)
- **violation_types** - Reference data for violation categories
- **reports** - Submitted violation reports

### Key Features

- Row Level Security (RLS) - users only see their own data
- Auto-calculated rewards (10% of fine)
- Duplicate detection function
- User stats view

---

## Features

- ✅ User authentication (email/password)
- ✅ Photo upload with GPS capture
- ✅ Violation type selection with reward estimates
- ✅ Report submission to Supabase
- ✅ Report history with status tracking
- ✅ User stats (total reports, earnings, success rate)
- ✅ Mobile-first responsive design

### Coming Soon

- [ ] Push notifications for report status changes
- [ ] Reverse geocoding for location names
- [ ] Admin dashboard for report review
- [ ] Duplicate detection before submission
- [ ] Payout integration

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

---

## Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + Storage)
- **Hosting**: Vercel

---

## License

MIT
