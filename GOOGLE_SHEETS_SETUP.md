# Google Sheets Export — Setup Guide

Follow these steps **once** to enable the "Export to Sheets" feature.

---

## Step 1 – Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project** → **New Project**
3. Name it (e.g. `Rangeway`) and click **Create**

---

## Step 2 – Enable the Google Sheets API

1. In the Cloud Console, go to **APIs & Services → Library**
2. Search for **"Google Sheets API"**
3. Click it and press **Enable**

---

## Step 3 – Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Give it a name (e.g. `rangeway-sheets-exporter`) and click **Create and Continue**
4. Skip optional role assignment and click **Done**

---

## Step 4 – Download the JSON Key File

1. In the Credentials page, click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key → Create new key → JSON**
4. The key file will be downloaded automatically
5. Rename it to `google-service-account.json`
6. Place it in the `backend/` folder:
   ```
   Rangeway/
   └── backend/
       └── google-service-account.json   ← place it here
   ```

> ⚠️ This file is already in `.gitignore`. **Never commit it to source control.**

---

## Step 5 – Create a Google Sheet

1. Go to [https://sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet
2. Rename it (e.g. `Rangeway Job Cards`)
3. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  >>>SHEET_ID_IS_HERE<<<  /edit
   ```

---

## Step 6 – Share the Sheet with the Service Account

1. Open your `google-service-account.json` file and find the `client_email` value.
   It will look like: `rangeway-sheets-exporter@your-project.iam.gserviceaccount.com`
2. In your Google Sheet, click **Share**
3. Paste the `client_email` into the share field
4. Set the role to **Editor**
5. Click **Share** (uncheck "Notify people" if prompted)

---

## Step 7 – Update Your `.env` File

Open `backend/.env` and fill in these two values:

```env
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-service-account.json
```

---

## Step 8 – Restart the Backend Server

```bash
cd backend
npm start
```

---

## Done! 🎉

Now click the **"Export to Sheets"** button on the Dashboard. All job card data will be written to your Google Sheet and the sheet will automatically open in a new browser tab.
