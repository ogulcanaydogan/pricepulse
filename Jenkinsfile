pipeline {
    agent any

    environment {
        AWS_DEFAULT_REGION = 'us-east-1'
        TF_IN_AUTOMATION = 'true'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Verify Tools') {
            steps {
                sh 'terraform -version || echo "Terraform not installed"'
                sh 'python3 --version || echo "Python3 not installed"'
                sh 'pip3 --version || echo "pip3 not installed"'
            }
        }

        stage('Terraform Init & Validate') {
            steps {
                dir('infra') {
                    sh 'terraform init -input=false'
                    sh 'terraform validate'
                }
            }
        }

        stage('Build Lambda Packages') {
            steps {
                dir('infra') {
                    sh '''
                        python3 -m pip install -r lambda_api/requirements.txt -t lambda_api/ --quiet
                        python3 -m pip install -r lambda_worker/requirements.txt -t lambda_worker/ --quiet
                    '''
                }
            }
        }

        stage('Terraform Plan') {
            when {
                branch 'main'
            }
            steps {
                dir('infra') {
                    sh 'terraform plan -out=tfplan -input=false'
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

        stage('Deploy Frontend') {
            when {
                branch 'main'
            }
            steps {
                dir('infra') {
                    sh '''
                        if [ -f deploy-frontend.sh ]; then
                            chmod +x deploy-frontend.sh
                            ./deploy-frontend.sh
                        else
                            echo "Frontend deployment script not found, skipping..."
                        fi
                    '''
                }
            }
        }
    }

    post {
        always {
            cleanWs(cleanWhenNotBuilt: false,
                    deleteDirs: true,
                    disableDeferredWipeout: true,
                    notFailBuild: true,
                    patterns: [[pattern: '.terraform/**', type: 'EXCLUDE'],
                               [pattern: '**/*.tfstate*', type: 'EXCLUDE']])
        }
        failure {
            echo 'Pipeline failed! Check the logs above for details.'
        }
        success {
            echo 'Pipeline completed successfully!'
        }
    }
}
