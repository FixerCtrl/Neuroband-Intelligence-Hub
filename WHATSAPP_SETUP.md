# WhatsApp Integration Setup

The WhatsApp integration uses Meta WhatsApp Cloud API and Supabase Edge Functions. The browser never receives Meta access tokens or the Supabase service-role key.

## Prerequisites

- A Meta Business portfolio, WhatsApp Business phone number, and Meta app with WhatsApp Cloud API enabled.
- A production access token and the phone number ID from Meta.
- Supabase CLI installed and this project linked to the correct Supabase project.
- Run the updated `schema.sql` in the Supabase SQL Editor before deploying the functions.
- Create and get approval for a WhatsApp Utility template named `task_assigned`, with English body text:

  `New Neuroband task: {{1}}. Due: {{2}}.`

The template carries only the task title and due date. Meta requires an approved template for business-initiated messages outside the customer-service window.

## Configure the Public Number

Set `WHATSAPP_BUSINESS_NUMBER` in `config.js` to the WhatsApp Business number in international format, for example `+27...`. This number is shown in the Team tab and used to open a prefilled WhatsApp message. It is not a secret.

## Store Server Secrets

Set these in Supabase Edge Function secrets, not in `config.js`, HTML, or browser JavaScript:

```sh
supabase secrets set \
  WHATSAPP_ACCESS_TOKEN="<Meta permanent access token>" \
  WHATSAPP_PHONE_NUMBER_ID="<Meta phone number ID>" \
  WHATSAPP_GRAPH_API_VERSION="<supported Graph API version>" \
  META_APP_SECRET="<Meta app secret>" \
  WHATSAPP_WEBHOOK_VERIFY_TOKEN="<your random webhook verification phrase>" \
  WHATSAPP_TASK_TEMPLATE_NAME="task_assigned" \
  WHATSAPP_TASK_TEMPLATE_LANGUAGE="en"
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never expose or paste the service-role key into the website.

## Deploy the Functions

From the project root, link the CLI to the Supabase project, then deploy:

```sh
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy whatsapp-link-code
supabase functions deploy whatsapp-disconnect
supabase functions deploy whatsapp-task-assigned
supabase functions deploy whatsapp-webhook
```

The webhook is configured to accept Meta's unauthenticated webhook requests and verifies each POST using `META_APP_SECRET`. The other functions require a signed-in Supabase user.

## Register the Meta Webhook

Use this callback URL in Meta's WhatsApp webhook configuration:

```text
https://<your-project-ref>.supabase.co/functions/v1/whatsapp-webhook
```

Enter the same `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value and subscribe to the `messages` field. Meta will verify the callback with the GET challenge, then sign webhook POST requests.

## Member Linking and Consent

1. A signed-in teammate opens **Team** and selects **Connect WhatsApp**.
2. The hub displays a one-time code that expires after 10 minutes.
3. The teammate sends the prefilled `CONNECT <code>` message from their own WhatsApp account to the configured business number.
4. That inbound message verifies the number and opts it in to brief task-assignment alerts. The teammate can disconnect at any time from the Team tab.

A task alert is sent for new assignments and admin reassignments only when the assignee has completed this linking flow. If the assignee has not connected, the task still saves normally and the app reports that no alert was sent.

## Submit a Source in WhatsApp

After linking, send a PDF, JPEG, PNG, or WebP file no larger than 20 MB to the business number. The bot asks for the KIN, KIQ, source title, author/publisher, source type, publication date, and relevance. Reply `SKIP` if the publication date is unknown or `CANCEL` to remove the in-progress upload. After the final answer, the file is stored in Supabase Storage and a corresponding entry is added to the Repository and Activity log.

The intake choices are defined in `supabase/functions/whatsapp-webhook/index.ts`. Keep its KIN/KIQ IDs and source-type options aligned with `config.js` when those values change.

## Privacy and Limits

- Phone numbers and WhatsApp consent timestamps are stored in the private `member_whatsapp` table. Signed-in users can read only their own settings; Edge Functions use the service-role key server-side.
- Intake conversation state is stored in a server-only table with no client read policy.
- Disconnecting removes the phone link, opt-in, and any unfinished uploaded source file. Completed Repository entries are not removed.
- The first version supports one guided source intake at a time per WhatsApp number and PDF/JPEG/PNG/WebP files up to 20 MB.
- This repository does not contain Meta credentials, a deployed webhook URL, or an approved message template. WhatsApp delivery will remain inactive until the setup above is completed.
