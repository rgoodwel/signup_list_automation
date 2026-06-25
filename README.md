# Signup List Automation

This repository contains a minimal React application (Vite) that you can build and deploy as a static website to AWS (S3, CloudFront, or Amplify).

Quick start

1. Install dependencies

   npm install

2. Run locally

   npm run dev

3. Build for production

   npm run build

The production build will be generated in the dist/ directory.

Deploy to AWS S3 (static website)

- Create an S3 bucket (e.g., my-site.example.com).
- In the S3 console, enable static website hosting or upload the contents of the dist/ folder to the bucket.
- If you want HTTPS and a CDN, create a CloudFront distribution that points to the S3 bucket (or use AWS Amplify which handles build & deploy).

Deploy with AWS Amplify (recommended for CI/CD)

- Connect the repository to AWS Amplify from the AWS console and Amplify will build using `npm run build` and host the resulting site.

Notes

- This app stores signups in the browser's localStorage. For real automation you can wire the form to an API endpoint or AWS Lambda + DynamoDB / SES.
