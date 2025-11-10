# 🪙 PricePulse — Multi-User AWS Price Tracker

**price.ogulcanaydogan.com**  
Personal and family-friendly web app to track online product prices and get notified when prices drop.

---

## 🚀 Overview

PricePulse is a **serverless AWS-based price monitoring platform**.  
Users can register (via Cognito), add URLs to track, set target prices, and receive alerts when prices fall below their targets.  
Supports multiple users (e.g., family members) each with their own watchlists.

---

## 🧩 Architecture

**AWS Services Used**
| Layer | AWS Service | Purpose |
|-------|--------------|----------|
| UI | **S3 + CloudFront** | Host static web frontend at `price.ogulcanaydogan.com` |
| Auth | **Cognito User Pool** | Multi-user sign-in / registration |
| API | **API Gateway + Lambda (Python)** | CRUD for items (add / update / delete / list) |
| Storage | **DynamoDB** | Store user-specific watchlists |
| Scheduler | **EventBridge (cron)** | Trigger daily scan Lambda |
| Worker | **Lambda (Python)** | Fetch prices & send alerts |
| Notifications | **SNS / SES** | Email or SMS alerts |
| IaC | **Terraform** | Infrastructure as Code |
| CI/CD | **Jenkins + GitHub** | Auto-deploy infra & code on push |

---

## 🕐 Scan Frequency

- Default: **Once or twice daily** (09:00 & 21:00 UTC)
- Configurable in Terraform: `cron(0 9 * * ? *)` and/or `cron(0 21 * * ? *)`
- Each item may have optional `frequency_minutes` override for flexible scanning.

---

## 🧰 Repository Structure

```
pricepulse/
├── infra/
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── dist/
│   │   └── .gitkeep
│   ├── lambda_api/
│   │   ├── lambda_function.py
│   │   └── requirements.txt
│   └── lambda_worker/
│       ├── lambda_function.py
│       └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── add-item.html
│   ├── notifications.html
│   ├── profile.html
│   └── assets/
│       ├── css/styles.css
│       └── js/app.js
├── Jenkinsfile
└── README.md
```

---

## 🧠 Core Features (MVP)

✅ Multi-user (family members can each log in)  
✅ Add product URLs and target prices  
✅ Daily scanning & alerting via AWS Lambda  
✅ Email (and optional SMS) notifications  
✅ Secure login with AWS Cognito  
✅ Easy-to-use UI on `price.ogulcanaydogan.com`  
✅ Infrastructure fully managed by Terraform  
✅ Auto-deployment via Jenkins pipeline

---

## 🛠️ Getting Started

### Prerequisites

- Terraform 1.4+
- Node.js 18+
- Python 3.11 + pip
- AWS credentials with permissions to create the resources listed below

### Bootstrap the infrastructure

```bash
cd infra
python -m venv .venv && source .venv/bin/activate
pip install -r lambda_api/requirements.txt -t lambda_api/
pip install -r lambda_worker/requirements.txt -t lambda_worker/
terraform init
terraform apply
```

The Terraform apply step outputs the API endpoint, Cognito pool IDs, and SNS topic ARN. When you connect the prototype to
live services, reference those values from your chosen frontend build system.

### Preview the UI locally

The repository ships with a static HTML prototype of the family dashboard so you can review the
experience without installing Node.js packages. Serve it with any static file server — for
example Python's built-in option:

```bash
cd frontend
python -m http.server 4173
```

Then open `http://localhost:4173/` in your browser. The preview persists demo data in your
browser's local storage so you can navigate between the dashboard, add-item flow, notification
history, and profile preferences as if the app were live.

### Trigger the worker manually

```bash
aws lambda invoke \
  --function-name pricepulse-dev-worker \
  --payload '{}' \
  response.json
cat response.json
```

The worker fetches prices, updates the DynamoDB table, and publishes alerts to the SNS topic when thresholds are met.

---

## 💡 UI Design Overview

**Frontend:** Static HTML/CSS prototype (mirrors planned React experience), hosted on S3 + CloudFront.

### 🔹 Pages
| Page | Description |
|-------|-------------|
| **Dashboard** | List of all tracked items |
| **Add Item** | URL input → auto-detect price → set target price |
| **Notifications** | Choose e-mail or SMS alerts |
| **Profile** | Change password, timezone, frequency preference |

### 🔹 Dashboard Table Fields
| Column | Description |
|---------|-------------|
| Product | URL or product name (auto-extracted) |
| Last Price | Last fetched value |
| Target | Desired threshold |
| Status | Active / Disabled |
| Last Checked | UTC timestamp |
| Actions | Edit / Delete / Test |

### 🔹 Sample UI flow
- User logs in → “Add Item” → enters Camper product URL  
- System extracts price preview (via `/test-extract`)  
- User sets target price and saves  
- Worker Lambda scans daily, sends SNS email if condition met  

---

## 🧰 Lambda Functions

| Function | Description |
|----------|-------------|
| `lambda_api` | Handles authenticated CRUD requests from API Gateway. Supports create/update/delete/list operations per Cognito user and can trigger immediate notification tests. |
| `lambda_worker` | Scheduled by EventBridge twice daily. Scrapes tracked product pages, updates pricing metadata, and publishes alerts to SNS when the current price meets user targets. |

Each Lambda shares the DynamoDB table defined in Terraform and publishes messages to the shared SNS topic.

---

## 🔔 Notification Logic

- If `current_price <= target_price` → send alert via SNS/SES  
- Each item notifies **once per 24h** to prevent spam  
- Users can disable notifications per item in UI  

---

## 🧱 Terraform Modules (planned)

| Module | Purpose |
|--------|----------|
| `lambda_worker` | Price scanner Lambda |
| `lambda_api` | CRUD + Auth API |
| `dynamodb` | PriceWatch table |
| `cognito` | Auth and user pool setup |
| `eventbridge` | Scheduler rules (daily) |
| `sns` | Notification system |
| `frontend` | S3 + CloudFront setup |

---

## ⚙️ Jenkins Pipeline

| Stage | Action |
|--------|--------|
| **Checkout** | Clone from GitHub |
| **Prepare Lambda Package** | Install dependencies + zip for deploy |
| **Terraform Init/Validate** | Ensure syntax and modules ready |
| **Plan** | `terraform plan` with variables |
| **Apply** | `terraform apply -auto-approve` on main branch |
| **Notify** | Email if build fails |

Auto-triggers on push to `main` branch.

---

## 🕐 Deployment

### Prerequisites

1. **SSL Certificate**: Request and validate ACM certificate in `us-east-1` region
   ```bash
   # See SSL_SETUP.md for detailed instructions
   aws acm request-certificate \
     --domain-name price.ogulcanaydogan.com \
     --validation-method DNS \
     --region us-east-1
   ```

2. **Route53 Hosted Zone**: Ensure `ogulcanaydogan.com` is hosted in Route53

3. **Terraform Variables**: Create `infra/terraform.tfvars`
   ```hcl
   acm_certificate_arn = "arn:aws:acm:us-east-1:XXX:certificate/XXX"
   domain_name         = "price.ogulcanaydogan.com"
   root_domain_name    = "ogulcanaydogan.com"
   ```

### Deployment Steps

1️⃣ **Deploy Infrastructure**
```bash
cd infra
terraform init
terraform apply
```

This creates:
- DynamoDB table
- Lambda functions (API + Worker)
- API Gateway
- Cognito User Pool
- SNS topic
- S3 bucket
- CloudFront distribution
- Route53 DNS records

2️⃣ **Deploy Frontend**
```bash
cd infra
./deploy-frontend.sh
```

This will:
- Upload static files to S3
- Invalidate CloudFront cache
- Display website URL

3️⃣ **Test Worker Lambda**
```bash
aws lambda invoke \
  --function-name pricepulse-dev-worker \
  --payload '{}' \
  response.json && cat response.json
```

4️⃣ **Access Website**
```
https://price.ogulcanaydogan.com
```

### Manual Deployment (Alternative)
```bash
# Sync files to S3
aws s3 sync frontend/ s3://price.ogulcanaydogan.com/ --delete

# Invalidate CloudFront cache
CLOUDFRONT_ID=$(cd infra && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"
```

| Area | Tool |
|------|------|
| Infra | Terraform |
| CI/CD | Jenkins |
| Backend | Python 3.11 + Boto3 + BeautifulSoup |
| Frontend | React (Vite or Next.js) |
| Auth | Cognito |
| Storage | DynamoDB |
| Notifications | SNS / SES |
| Scheduler | EventBridge |
| Hosting | S3 + CloudFront |

---

## 🧩 Advanced / Future Features

| Feature | Description |
|----------|-------------|
| 🕵️‍♂️ Smart Selector | Auto-detect CSS/XPath from user input |
| 💹 Price History | Store and plot previous values |
| 📊 Charts | Visualize price trends (Recharts/Chart.js) |
| 🪄 Browser Extension | Add products directly from Chrome |
| 📱 PWA / Mobile App | Installable web app |
| 🌍 Multi-Currency | Convert GBP↔USD↔EUR automatically |
| 🔐 MFA & Roles | Family roles: admin / member |
| 🧾 Daily Digest | “Your watched items summary” email |
| 🤖 Telegram Bot | Receive price alerts via Telegram |
| 🧠 AI Insight (Phase 2) | Predict next price drop using ML |
| 🧰 API Tokens | Allow 3rd-party integration (Zapier, IFTTT) |

---

## 🪪 IAM & Security Highlights

- Least privilege IAM (Lambda limited to specific ARNs)  
- HTTPS enforced (CloudFront + ACM)  
- Cognito JWT verified by API Gateway authorizer  
- CloudWatch monitoring & alarms  
- Data encrypted at rest (DynamoDB + SNS)  

---

## 📦 Deployment Checklist

1. Confirm Terraform state bucket and DynamoDB lock table exist.
2. Run Terraform workflow (init → validate → plan → apply).
3. Package Lambda functions (worker + API) and upload artifacts.
4. Deploy frontend build to S3 bucket behind CloudFront.
5. Test Cognito signup/sign-in flow with multi-user scenario.
6. Trigger worker Lambda manually to verify price fetch & SNS.
7. Monitor CloudWatch metrics and alarms post-deployment.

---

## 🪄 Ek UI & Feature Önerileri (Aile Kullanımı için)

| Kategori | Öneri | Neden |
|-----------|--------|-------|
| 👥 Çoklu kullanıcı yönetimi | Kullanıcı adını üst menüde göster, “Aile üyesi ekle” butonu (Cognito invite flow) | Eşin/annen kendi e-postalarıyla girebilsin |
| 🏷️ Etiket sistemi | Her item’e “kim ekledi” etiketi (Anne / Eşim / Ben) | Ortak listelerde kimin eklediğini gösterir |
| 🕰️ Bildirim geçmişi | UI’da “en son bildirim zamanı” sütunu | Kimin ne zaman bildirim aldığı izlenebilir |
| 📱 Mobil PWA | iPhone ana ekrana eklenebilir hafif app | Telefonlardan kolay erişim |
| 🌙 Tema | Koyu / açık tema toggle | Aile üyeleri için erişilebilirlik |
| 🧾 Günlük özet maili | “Bugün izlenen fiyatlar” e-postası | Fiyat düşmese de genel görünüm sağlar |
| 🔔 Push Notification (VAPID) | Web push izinli tarayıcı bildirimi | SMS yerine ücretsiz push |
| 🪄 AI Selector Assistant | URL’deki fiyatı otomatik bul | Teknik bilmeyen kullanıcılar için kolaylık |
| 🛍️ Site logoları | Bilinen mağazalar (Camper, Zara, Amazon) için favicon/brand rengi göster | Görsel olarak ayırt etmesi kolay olur |

---

## 📞 Contact & Next Steps

- Repo name: **pricepulse** (can be adjusted if needed).  
- Ready to export this README as `pricepulse_README.md` for GitHub if desired.  
- Next decision: proceed with this repo name or update before publishing.

