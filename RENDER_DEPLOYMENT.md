# Render Deployment Guide

## 🚀 Deploy to Render

### **Memory Optimization Applied**
- ✅ **Build**: 4GB memory allocation for compilation
- ✅ **Runtime**: 512MB memory allocation for production
- ✅ **Dependencies**: Removed unused packages
- ✅ **Node.js**: Specified stable version (18.20.0)

### **Step 1: Prepare Repository**
1. Commit all changes to your Git repository
2. Push to GitHub/GitLab

### **Step 2: Create Render Service**
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your repository

### **Step 3: Configure Service**
- **Name**: `tele-journal`
- **Environment**: `Node`
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm run start:prod`
- **Plan**: Free (or paid for better performance)

### **Step 4: Environment Variables**
Add these in Render dashboard:

```
NODE_ENV=production
TELEGRAM_BOT_TOKEN=your_bot_token
DATABASE_URL=your_database_url
ASSEMBLYAI_API_KEY=your_assemblyai_key
MISTRAL_API_KEY=your_mistral_key
AI_PROVIDER=mistral
SPEECH_PROVIDER=assemblyai
MISTRAL_CHAT_MODEL=mistral-small-latest
MISTRAL_EMBEDDING_MODEL=mistral-embed
```

### **Step 5: Database Setup**
For PostgreSQL on Render:
1. Create a PostgreSQL service
2. Copy the connection string
3. Add as `DATABASE_URL` environment variable

### **Memory Issues Solutions**

#### **If Build Still Fails:**
1. **Upgrade Plan**: Use Starter plan ($7/month) for more memory
2. **Split Build**: Use GitHub Actions for building
3. **Optimize Code**: Remove unused imports/dependencies

#### **Alternative: GitHub Actions Build**
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Render
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - name: Deploy to Render
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

### **Monitoring**
- Check Render logs for any issues
- Monitor memory usage in dashboard
- Set up health checks for reliability

## 🎯 **Quick Deploy**
1. Push code to GitHub
2. Connect to Render
3. Add environment variables
4. Deploy!

Your bot should now run smoothly on Render! 🚀
