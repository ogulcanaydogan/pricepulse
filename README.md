# PricePulse – Multi-User AWS Price Tracker

**Live domain:** `price.ogulcanaydogan.com`

PricePulse is a serverless application that helps households monitor online product prices and receive alerts when items drop below their target price. The platform supports multiple users so family members can maintain individual watchlists under the same account.

---

## Overview

PricePulse combines a static web experience with an AWS-native backend. Users authenticate with Amazon Cognito, add URLs to monitor, define target prices, and receive email or SMS notifications when the current price meets their criteria. A scheduled worker Lambda scans each watchlist on a recurring basis to keep price data current.

---

## Architecture

| Layer | AWS Service | Purpose |
|-------|-------------|---------|
| User Interface | Amazon S3 + CloudFront | Hosts the static frontend prototype |
| Authentication | Amazon Cognito User Pool | Manages sign-in, registration, and JWT issuance |
| API | Amazon API Gateway + AWS Lambda (Python) | Provides CRUD endpoints for watchlist items |
| Storage | Amazon DynamoDB | Persists user-specific price tracking data |
| Scheduler | Amazon EventBridge | Triggers the worker Lambda on a defined cron schedule |
| Worker | AWS Lambda (Python) | Fetches prices, updates DynamoDB, and issues notifications |
| Notifications | Amazon SNS / Amazon SES | Delivers alert emails or optional SMS messages |
| Infrastructure as Code | Terraform | Deploys and manages all AWS resources |
| CI/CD | Jenkins + GitHub | Automates packaging and deployment on push |

---

## Repository Structure

```
pricepulse/
├── infra/
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── dist/
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

## Core Features

- Multi-user authentication using Amazon Cognito
- Add, edit, delete, and list price watch items
- Scheduled price checks powered by AWS Lambda and EventBridge
- Email notifications (with optional SMS) when target prices are met
- Infrastructure managed end-to-end with Terraform
- Static HTML prototype to demonstrate the dashboard, notifications, and profile flows

---

## Getting Started

### Prerequisites

- Terraform 1.4 or later
- Python 3.11 with `pip`
- AWS CLI configured with permissions to create IAM, Lambda, DynamoDB, API Gateway, SNS, S3, and CloudFront resources

### Package the Lambda dependencies

Install Python dependencies into the Lambda source folders so Terraform can bundle them when creating the ZIP archives:

```bash
cd infra
python -m venv .venv
source .venv/bin/activate
pip install -r lambda_api/requirements.txt -t lambda_api/
pip install -r lambda_worker/requirements.txt -t lambda_worker/
```

### Deploy the infrastructure

```bash
cd infra
terraform init
terraform apply
```

Important Terraform variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region for the deployment | `us-east-1` |
| `environment` | Environment suffix added to resource names | `dev` |
| `frontend_bucket_name` | Optional override for the S3 bucket name | empty string |
| `cloudfront_alternate_domain_names` | List of custom domains served by CloudFront | `[]` |
| `acm_certificate_arn` | ACM certificate ARN required when custom domains are provided | empty string |
| `enable_sms_notifications` | Whether to create an SNS SMS subscription | `false` |
| `allowed_cors_origins` | List of origins permitted to call the HTTP API | `[*]` |

The `terraform apply` output includes the API endpoint, Cognito user pool details, SNS topic ARN, CloudFront distribution domain name, and the S3 bucket name that hosts the frontend.

### Preview the static UI locally

The repository ships with a static HTML prototype of the user experience. Any static file server will work; the example below uses Python:

```bash
cd frontend
python -m http.server 4173
```

Open `http://localhost:4173/` in your browser to explore the dashboard, add-item flow, notification history, and profile preferences. Demo data is stored in local storage so the prototype behaves like a live application.

### Trigger the worker manually

```bash
aws lambda invoke \
  --function-name pricepulse-dev-worker \
  --payload '{}' \
  response.json
cat response.json
```

The worker fetches prices, updates DynamoDB, and publishes alerts to the SNS topic when thresholds are met.

---

## UI Design Reference

Frontend: static HTML and CSS prototype (mirrors the planned React experience), hosted on S3 and delivered through CloudFront.

### Pages

| Page | Purpose |
|------|---------|
| Dashboard | Displays the full list of tracked items |
| Add Item | Collects product URL, target price, and notification preferences |
| Notifications | Shows recent alerts and delivery channel information |
| Profile | Stores user preferences such as timezone, frequency, and contact data |

### Dashboard Table Columns

| Column | Description |
|--------|-------------|
| Product | URL or product name extracted from the source |
| Last Price | Most recent price captured by the worker |
| Target | Desired threshold that triggers an alert |
| Status | Indicates whether tracking is active or paused |
| Last Checked | Timestamp of the latest scan |
| Actions | Edit, delete, or send a test notification |

### Example User Flow

1. User logs in through Cognito and lands on the dashboard.
2. From the Add Item page the user provides a product URL and target price.
3. The system extracts a price preview and saves the watch entry.
4. The worker Lambda scans each item on the configured schedule.
5. When the current price is less than or equal to the target, SNS delivers an email (and optionally an SMS) alert.

---

## Future Enhancements

| Feature | Description |
|---------|-------------|
| Smart Selector | Automatically detect the correct price element from product pages |
| Price History | Persist previous values to display trends |
| Charts | Visualize price movements over time |
| Browser Extension | Add products directly from a browser button |
| Progressive Web App | Offer an installable mobile-friendly experience |
| Multi-Currency Support | Convert prices between major currencies |
| Role-Based Access | Support admin and member roles for households |
| Daily Digest Emails | Summarize watched items even when no alerts are triggered |
| Telegram Bot Integration | Send price alerts through Telegram |
| Machine Learning Insights | Predict price drops based on historical data |

---

## Security Considerations

- IAM roles follow the principle of least privilege for Lambda and supporting services.
- All public endpoints enforce HTTPS via CloudFront.
- Cognito JWTs are validated by API Gateway to authorize API requests.
- DynamoDB and SNS data is encrypted at rest.
- CloudWatch metrics and logs capture runtime behavior for monitoring and alerting.

---

## Deployment Pipeline

The Jenkins pipeline defined in `Jenkinsfile` performs the following stages on each push to the main branch:

1. Checkout source code from GitHub.
2. Install Lambda dependencies and build deployment artifacts.
3. Run `terraform fmt`, `terraform validate`, and `terraform plan`.
4. Apply infrastructure changes after approval (or automatically on main).
5. Upload the static frontend to the provisioned S3 bucket.
6. Notify maintainers when a build fails.

---

## Support

For feature ideas or issues, open a GitHub discussion or issue in this repository so the team can coordinate next steps.
