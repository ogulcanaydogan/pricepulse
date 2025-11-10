pipeline {
    agent any

    environment {
        AWS_DEFAULT_REGION = credentials('pricepulse-aws-region')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Terraform') {
            steps {
                sh 'terraform -version || true'
            }
        }

        stage('Terraform Init & Validate') {
            steps {
                dir('infra') {
                    sh 'terraform init'
                    sh 'terraform validate'
                }
            }
        }

        stage('Build Lambda Packages') {
            steps {
                dir('infra') {
                    sh 'pip install -r lambda_api/requirements.txt -t lambda_api/'
                    sh 'pip install -r lambda_worker/requirements.txt -t lambda_worker/'
                }
            }
        }

        stage('Terraform Plan') {
            when {
                branch 'main'
            }
            steps {
                dir('infra') {
                    sh 'terraform plan -out=tfplan'
                }
            }
        }

        stage('Terraform Apply') {
            when {
                branch 'main'
            }
            steps {
                dir('infra') {
                    sh 'terraform apply -auto-approve tfplan'
                }
            }
        }

        stage('Frontend Build') {
            steps {
                dir('frontend') {
                    sh 'npm install'
                    sh 'npm run build'
                }
            }
        }
    }

    post {
        failure {
            mail to: 'alerts@example.com',
                 subject: 'PricePulse Pipeline Failed',
                 body: "Check Jenkins for more information."
        }
    }
}
