# Kitchenly kitchen shop

A small, responsive shop for everyday kitchen tools. It has a product catalogue, search and category filters, a shopping bag, Google sign-in, and a checkout page. Checkout saves orders in Supabase and currently offers **cash on delivery**; it does not charge a card.

## Run the shop on your computer

1. Install Node.js if it is not already installed. Node.js runs the local website server.
2. Open a terminal in this folder and run `npm install` once. This downloads the two libraries the site uses.
3. Make a copy of `.env.example` and name the copy `.env`. Put your Supabase values in it as explained below.
4. Run `npm run dev`, then open the local address shown in the terminal (usually `http://localhost:5173`).

Without Supabase values, the website opens in preview mode with sample products. You can try the shop and bag; the preview bag is saved in this browser only. Checkout cannot save an order until Supabase is connected.

## Connect Supabase (the database and sign-in service)

1. Create a project at [supabase.com](https://supabase.com). A project is the online home for this shop's data.
2. In the project, open **Project Settings → API**. Copy the **Project URL** and the **publishable key** (or older **anon** key) into `.env`:

   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

   The publishable/anon key is meant for a website. Never put a `service_role` key in this project; it bypasses the database's safety rules.

3. In Supabase, open **SQL Editor**, choose **New query**, paste all of `supabase/schema.sql`, and click **Run**. This creates products, customer profiles, saved bags, orders, and order items. It also adds example products.
4. Restart `npm run dev` after changing `.env`. The browser now reads products from Supabase. In the connected shop, customers sign in with Google before adding an item, so each saved bag lives in the `cart_items` table. Checkout saves an order and a copy of each item's name and price.

## Set up Google sign-in with Google Cloud Console

Google checks that the person really signed in. Supabase handles the secure hand-off back to the shop.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or choose a Google Cloud project.
2. Go to **Google Auth Platform** (or **APIs & Services → OAuth consent screen**) and fill in the app name, support email, and developer contact. For testing, choose **External** and add your Google account under **Test users**.
3. Go to **Clients** or **APIs & Services → Credentials → Create credentials → OAuth client ID**. Choose **Web application**.
4. Under **Authorized JavaScript origins**, add the site address, for example `http://localhost:5173`.
5. Under **Authorized redirect URIs**, add the callback address shown in Supabase under **Authentication → Sign In / Providers → Google**. It looks like `https://your-project-id.supabase.co/auth/v1/callback`. Copy the exact value Supabase shows.
6. Create the Google client and copy its **Client ID** and **Client secret**.
7. In Supabase, open **Authentication → Sign In / Providers → Google**, turn Google on, paste the Client ID and Client secret, and save.
8. In Supabase, open **Authentication → URL Configuration**. Set **Site URL** to `http://localhost:5173` and add `http://localhost:5173/**` to **Redirect URLs**. Later, add your published website address there too.
9. Restart the local site and click **Sign in**. Google should ask you to choose an account and return you to Kitchenly.

If Google's screens look different, follow Supabase's current [Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google) and [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

When you publish the shop, replace the local address with your published site address in both Google Cloud Console and Supabase URL Configuration. Keep the Google client secret in Supabase; it does not go in `.env` or browser code.

## Publish the shop for customers

1. Create an account at [Vercel](https://vercel.com/) and sign in with GitHub.
2. Choose **Add New → Project**, import `dbellz/kitchenly-shop`, and deploy. Vercel recognizes this Vite project; the build command is `npm run build` and the output folder is `dist`.
3. In the Vercel project's **Settings → Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using your Supabase project URL and publishable/anon key. Do not use a `service_role` key. Redeploy after adding or changing these values.
4. Vercel will give you a public address ending in `.vercel.app`. In Supabase **Authentication → URL Configuration**, set **Site URL** to that exact address and add it to **Redirect URLs**.
5. In Google Cloud Console, add the website's origin (the address without a page path) under **Authorized JavaScript origins**. Keep the Supabase callback address under **Authorized redirect URIs**.

The customer link is the Vercel address. Google sign-in and order saving work after the Supabase project, database setup, and Google provider are configured.

## What happens when someone checks out?

The browser asks Supabase to place the order. A database function checks the saved bag, confirms stock, calculates prices from the product table, writes the order and line items, reduces stock, and empties the bag together. If a step fails, the database rolls the whole checkout back, so it does not leave a half-finished order.

The database also has row-level security: each signed-in customer can access their own bag and orders. Anyone can read active products. You can inspect or change the database setup in `supabase/schema.sql` as you learn.

## Change products and prices

For a simple first edit, open **Supabase → Table Editor → products** and change a product's name, price, stock, or active status. This starter displays US dollars. To use another currency, change the `money` formatter near the top of `src/app.js`.

