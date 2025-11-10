# 🚀 Hızlı Başlangıç - price.ogulcanaydogan.com

Bu rehber projeyi `price.ogulcanaydogan.com` adresinde yayına almak için gereken adımları gösterir.

## 📋 Önkoşullar

- ✅ AWS hesabı (Admin erişimi)
- ✅ `ogulcanaydogan.com` domain'i Route53'te kayıtlı
- ✅ AWS CLI kurulu ve yapılandırılmış
- ✅ Terraform 1.4+ kurulu

## 1️⃣ SSL Sertifikası Oluştur (5-30 dakika)

CloudFront için **us-east-1** bölgesinde ACM sertifikası gereklidir.

```bash
# Sertifika talebi
export AWS_DEFAULT_REGION=us-east-1
aws acm request-certificate \
  --domain-name price.ogulcanaydogan.com \
  --validation-method DNS

# Sertifika ARN'ini al
CERT_ARN=$(aws acm list-certificates \
  --query 'CertificateSummaryList[?DomainName==`price.ogulcanaydogan.com`].CertificateArn' \
  --output text)

echo "Sertifika ARN: $CERT_ARN"
```

### DNS Doğrulama Kaydını Ekle

```bash
# Doğrulama bilgilerini al
aws acm describe-certificate --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

Çıktıdaki CNAME kaydını Route53'te `ogulcanaydogan.com` zone'una ekleyin.

**Otomatik eklemek için:**

```bash
# Zone ID'yi al
ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name ogulcanaydogan.com \
  --query 'HostedZones[0].Id' --output text | cut -d'/' -f3)

# Validation record bilgilerini al
VALIDATION_NAME=$(aws acm describe-certificate --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Name' --output text)
VALIDATION_VALUE=$(aws acm describe-certificate --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord.Value' --output text)

# CNAME kaydını oluştur
aws route53 change-resource-record-sets --hosted-zone-id $ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "'"$VALIDATION_NAME"'",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{"Value": "'"$VALIDATION_VALUE"'"}]
      }
    }]
  }'
```

### Sertifika Doğrulamasını Bekle

```bash
# Otomatik bekle (5-30 dakika sürebilir)
aws acm wait certificate-validated --certificate-arn $CERT_ARN
echo "✅ Sertifika doğrulandı!"
```

## 2️⃣ Terraform Yapılandırması

```bash
cd infra

# terraform.tfvars dosyasını oluştur
cat > terraform.tfvars <<EOF
acm_certificate_arn = "$CERT_ARN"
domain_name         = "price.ogulcanaydogan.com"
root_domain_name    = "ogulcanaydogan.com"
aws_region          = "us-east-1"
environment         = "prod"
EOF
```

## 3️⃣ Altyapıyı Kur (5-10 dakika)

```bash
cd infra

# Terraform'u başlat
terraform init

# Planı kontrol et
terraform plan

# Altyapıyı oluştur
terraform apply
```

Bu komut şunları oluşturur:
- ✅ S3 Bucket: `price.ogulcanaydogan.com`
- ✅ CloudFront Distribution (SSL ile)
- ✅ Route53 DNS kayıtları (A ve AAAA)
- ✅ DynamoDB tablosu
- ✅ Lambda fonksiyonları (API + Worker)
- ✅ API Gateway
- ✅ Cognito User Pool
- ✅ SNS bildirimleri

## 4️⃣ Frontend'i Deploy Et (2-3 dakika)

```bash
cd infra
./deploy-frontend.sh
```

Script şunları yapar:
- ✅ Frontend dosyalarını S3'e yükler
- ✅ CloudFront cache'ini temizler
- ✅ Website URL'ini gösterir

## 5️⃣ Test Et

### Kullanıcı Oluştur

```bash
# Terraform output'larını al
cd infra
USER_POOL_CLIENT_ID=$(terraform output -raw user_pool_client_id)

# Yeni kullanıcı oluştur
aws cognito-idp sign-up \
  --client-id $USER_POOL_CLIENT_ID \
  --username ogulcan \
  --password "YourSecurePassword123!" \
  --user-attributes Name=email,Value=your@email.com
```

### Website'i Aç

```bash
open https://price.ogulcanaydogan.com
```

veya tarayıcıda: **https://price.ogulcanaydogan.com**

## 🔄 Güncelleme Yapmak

Kod değişiklikleri yaptıktan sonra:

```bash
cd infra
./deploy-frontend.sh
```

## 🧪 Lambda Worker'ı Test Et

```bash
aws lambda invoke \
  --function-name pricepulse-prod-worker \
  --payload '{}' \
  response.json

cat response.json
```

## 📊 CloudWatch Logs

```bash
# API Lambda logları
aws logs tail /aws/lambda/pricepulse-prod-api --follow

# Worker Lambda logları
aws logs tail /aws/lambda/pricepulse-prod-worker --follow
```

## 🛠️ Sorun Giderme

### Website 403 hatası veriyor
```bash
# S3 bucket policy'yi kontrol et
aws s3api get-bucket-policy --bucket price.ogulcanaydogan.com

# CloudFront distribution durumunu kontrol et
CLOUDFRONT_ID=$(cd infra && terraform output -raw cloudfront_distribution_id)
aws cloudfront get-distribution --id $CLOUDFRONT_ID | grep Status
```

### DNS çözümlemiyor
```bash
# DNS propagation'ı kontrol et
dig price.ogulcanaydogan.com
nslookup price.ogulcanaydogan.com
```

DNS propagation 5-10 dakika sürebilir.

### SSL hatası
```bash
# Sertifika durumunu kontrol et
aws acm describe-certificate --certificate-arn $CERT_ARN \
  --region us-east-1 \
  --query 'Certificate.Status'
```

## 🗑️ Temizlik (Altyapıyı Silmek)

**DİKKAT:** Bu komut TÜM kaynakları siler!

```bash
cd infra

# S3 bucket'ı boşalt
aws s3 rm s3://price.ogulcanaydogan.com --recursive

# Terraform ile sil
terraform destroy
```

## 📚 Daha Fazla Bilgi

- **Detaylı SSL kurulumu**: `SSL_SETUP.md`
- **Proje dökümantasyonu**: `README.md`
- **Terraform yapılandırması**: `infra/`

## ✅ Kontrol Listesi

- [ ] SSL sertifikası oluşturuldu ve doğrulandı
- [ ] `terraform.tfvars` dosyası oluşturuldu
- [ ] `terraform apply` başarıyla tamamlandı
- [ ] Frontend deploy edildi
- [ ] Website açıldı: https://price.ogulcanaydogan.com
- [ ] Cognito kullanıcısı oluşturuldu
- [ ] Login testi yapıldı

## 🎉 Tebrikler!

Website'iniz artık **https://price.ogulcanaydogan.com** adresinde yayında!
