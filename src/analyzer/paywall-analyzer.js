/**
 * TWOtails Paywall Connection Analyzer
 * Verifies paywall integrations (RevenueCat, Stripe, etc.) are correctly connected
 */

const fs = require('fs');
const path = require('path');

class PaywallConnectionAnalyzer {
  constructor() {
    this.issues = [];
    this.stats = {
      filesScanned: 0,
      providers: {
        revenuecat: 0,
        stripe: 0,
        paddle: 0,
        appstore: 0,
        playstore: 0,
        lemon: 0,
        chargebee: 0,
        recurly: 0
      },
      issues: 0,
      errors: 0,
      warnings: 0
    };
    
    // Provider-specific patterns
    this.providers = {
      revenuecat: {
        name: 'RevenueCat',
        imports: ['Purchases', 'RevenueCat', '@revenuecat/purchases-js', '@revenuecat/purchases-capacitor'],
        config: ['Purchases.configure', 'Purchases.setDebugLogsEnabled'],
        usage: ['Purchases.getOfferings', 'Purchases.purchasePackage', 'Purchases.restorePurchases'],
        entitlements: ['Purchases.getCustomerInfo', 'entitlements.active'],
        platforms: {
          ios: ['SKProductsRequest', 'SKPaymentQueue', 'StoreKit'],
          android: ['BillingClient', 'PurchasesUpdatedListener'],
          web: ['PurchasesWeb', 'Stripe']
        }
      },
      stripe: {
        name: 'Stripe',
        imports: ['stripe', '@stripe/stripe-js', '@stripe/react-stripe-js'],
        config: ['Stripe(', 'loadStripe'],
        usage: ['stripe.customers', 'stripe.subscriptions', 'stripe.checkout.sessions'],
        webhooks: ['stripe.webhooks', 'constructEvent'],
        billingPortal: ['stripe.billingPortal.sessions.create']
      },
      paddle: {
        name: 'Paddle',
        imports: ['paddle.js', '@paddle/paddle-js'],
        config: ['Paddle.Setup', 'Paddle.Initialize'],
        usage: ['Paddle.Checkout.open', 'Paddle.User']
      },
      appstore: {
        name: 'App Store / StoreKit',
        imports: ['StoreKit', 'StoreKit2'],
        config: ['SKProductsRequest', 'Product'],
        usage: ['purchase', 'Transaction.currentEntitlements', 'AppTransaction']
      },
      playstore: {
        name: 'Google Play Billing',
        imports: ['BillingClient', 'com.android.billingclient'],
        config: ['BillingClient.newBuilder', 'startConnection'],
        usage: ['queryProductDetailsAsync', 'launchBillingFlow', 'queryPurchasesAsync']
      }
    };
  }

  async analyzeDirectory(dirPath, options = {}) {
    const { glob } = require('glob');
    const ignoreDirs = (options.ignoreDirs || 'node_modules,dist,.git,coverage').split(',');
    const ignorePatterns = ignoreDirs.map(d => `**/${d}/**`);

    console.log('PAYWALL DEBUG: dirPath =', dirPath);
    console.log('PAYWALL DEBUG: cwd =', process.cwd());
    
const files = await glob('**/*.{js,jsx,ts,tsx,py,go,java,rb,swift,kt}', {
      cwd: dirPath,
      ignore: [...ignorePatterns, '**/*.min.js', '**/*.map'],
      absolute: true
    });

    for (const file of files) {
      try {
        this.analyzeFile(file);
      } catch (err) {
        // Skip unparseable files
      }
    }

    this.stats.issues = this.issues.length;
    this.stats.errors = this.issues.filter(i => i.severity === 'ERROR').length;
    this.stats.warnings = this.issues.filter(i => i.severity === 'WARNING').length;

    return {
      issues: this.issues,
      stats: this.stats
    };
  }

  analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    this.stats.filesScanned++;

    // Detect which provider(s) are used
    const detectedProviders = this.detectProviders(content);
    console.log('PAYWALL DEBUG: detectedProviders:', detectedProviders);
    
    detectedProviders.forEach(provider => {
      this.stats.providers[provider]++;
      this.checkProvider(filePath, content, lines, provider);
    });

    // Cross-file checks
    this.checkCrossFileConsistency(filePath, content, detectedProviders);
  }

  detectProviders(content) {
    const detected = [];
    Object.keys(this.providers).forEach(key => {
      const provider = this.providers[key];
      const found = provider.imports.some(imp => 
        content.includes(imp) || 
        content.includes(`require('${imp}')`) ||
        content.includes(`require("${imp}")`) ||
        content.includes(`from '${imp}'`) ||
        content.includes(`from "${imp}"`) ||
        content.includes(`import ${imp}`)
      );
      if (found) detected.push(key);
    });
    return detected;
  }

  checkProvider(filePath, content, lines, providerKey) {
    const provider = this.providers[providerKey];
    
    // 1. Check configuration exists
    this.checkConfig(filePath, lines, provider, providerKey);
    
    // 2. Check usage patterns
    this.checkUsage(filePath, lines, provider, providerKey);
    
    // 3. Check platform-specific setup
    this.checkPlatform(filePath, lines, provider, providerKey);
    
    // 4. Check error handling
    this.checkErrorHandling(filePath, lines, provider, providerKey);
    
    // 5. Check for common mistakes
    this.checkCommonMistakes(filePath, content, lines, provider, providerKey);
  }

  checkConfig(filePath, lines, provider, providerKey) {
    const hasConfig = lines.some(line => 
      provider.config.some(cfg => line.includes(cfg))
    );

    if (!hasConfig) {
      this.issues.push({
        file: filePath,
        line: 1,
        type: 'MISSING_PAYWALL_CONFIG',
        severity: 'ERROR',
        provider: provider.name,
        message: `${provider.name} imported but not configured`,
        suggestion: `Call ${provider.config[0]} with your API key`
      });
    }

    // Check for hardcoded API keys
    lines.forEach((line, idx) => {
      const apiKeyPatterns = [
        /(?:api[_-]?key|public[_-]?key)\s*[:=]\s*['"][a-zA-Z0-9_]{20,}['"]/,
        /(?:REVENUECAT|STRIPE|PADDLE)_API_KEY\s*[:=]\s*['"][a-zA-Z0-9_]{20,}['"]/
      ];
      
      apiKeyPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          this.issues.push({
            file: filePath,
            line: idx + 1,
            type: 'HARDCODED_PAYWALL_KEY',
            severity: 'ERROR',
            provider: provider.name,
            message: `Hardcoded ${provider.name} API key detected`,
            suggestion: 'Move to environment variable (process.env.REVENUECAT_API_KEY)'
          });
        }
      });
    });
  }

  checkUsage(filePath, lines, provider, providerKey) {
    const hasUsage = lines.some(line => 
      provider.usage.some(usage => line.includes(usage))
    );

    if (!hasUsage) {
      this.issues.push({
        file: filePath,
        line: 1,
        type: 'PAYWALL_NOT_USED',
        severity: 'WARNING',
        provider: provider.name,
        message: `${provider.name} configured but no usage found`,
        suggestion: `Use ${provider.usage[0]} to fetch offerings/products`
      });
    }

    // Check specific usage patterns
    lines.forEach((line, idx) => {
      // RevenueCat specific checks
      if (providerKey === 'revenuecat') {
        // Check getOfferings without error handling
        if (line.includes('getOfferings') && !line.includes('try') && !line.includes('catch')) {
          this.issues.push({
            file: filePath,
            line: idx + 1,
            type: 'MISSING_OFFERINGS_ERROR_HANDLING',
            severity: 'WARNING',
            provider: provider.name,
            message: 'getOfferings() called without error handling',
            suggestion: 'Wrap in try/catch - network can fail'
          });
        }

        // Check purchasePackage without verification
        if (line.includes('purchasePackage') && !line.includes('verify') && !line.includes('validate')) {
          this.issues.push({
            file: filePath,
            line: idx + 1,
            type: 'PURCHASE_NOT_VERIFIED',
            severity: 'WARNING',
            provider: provider.name,
            message: 'Purchase not verified server-side',
            suggestion: 'Verify receipt with RevenueCat backend or your server'
          });
        }

        // Check restorePurchases
        if (line.includes('restorePurchases') && !line.includes('try') && !line.includes('catch')) {
          this.issues.push({
            file: filePath,
            line: idx + 1,
            type: 'MISSING_RESTORE_ERROR_HANDLING',
            severity: 'WARNING',
            provider: provider.name,
            message: 'restorePurchases() called without error handling',
            suggestion: 'Wrap in try/catch - user may cancel or network fail'
          });
        }
      }

      // Stripe specific checks
      if (providerKey === 'stripe') {
        if (line.includes('checkout.sessions.create') && !line.includes('success_url') && !line.includes('cancel_url')) {
          this.issues.push({
            file: filePath,
            line: idx + 1,
            type: 'STRIPE_MISSING_URLS',
            severity: 'ERROR',
            provider: provider.name,
            message: 'Stripe Checkout session missing success_url or cancel_url',
            suggestion: 'Add success_url and cancel_url to session creation'
          });
        }

        if (line.includes('webhook') && !line.includes('constructEvent')) {
          this.issues.push({
            file: filePath,
            line: idx + 1,
            type: 'STRIPE_WEBHOOK_NOT_VERIFIED',
            severity: 'ERROR',
            provider: provider.name,
            message: 'Stripe webhook not verified with constructEvent',
            suggestion: 'Use stripe.webhooks.constructEvent to verify signature'
          });
        }
      }
    });
  }

  checkPlatform(filePath, lines, provider, providerKey) {
    if (!provider.platforms) return;

    const ext = path.extname(filePath);
    let platform = 'web';
    
    if (['.swift', '.m', '.mm'].includes(ext)) platform = 'ios';
    if (['.kt', '.java'].includes(ext)) platform = 'android';

    const platformImports = provider.platforms[platform] || [];
    const hasPlatformSetup = lines.some(line => 
      platformImports.some(imp => line.includes(imp))
    );

    if (!hasPlatformSetup && platform !== 'web') {
      this.issues.push({
        file: filePath,
        line: 1,
        type: 'MISSING_NATIVE_PAYWALL_SETUP',
        severity: 'WARNING',
        provider: provider.name,
        message: `${provider.name} used but native ${platform} billing setup not detected`,
        suggestion: `Add ${platform} billing setup: ${platformImports.join(', ')}`
      });
    }
  }

  checkErrorHandling(filePath, lines, provider, providerKey) {
    // Check for proper try/catch around async paywall calls
    lines.forEach((line, idx) => {
      const asyncPaywallCalls = [
        'getOfferings', 'purchasePackage', 'restorePurchases',
        'getCustomerInfo', 'checkout.sessions.create',
        'billingPortal.sessions.create', 'queryProductDetailsAsync',
        'launchBillingFlow'
      ];

      asyncPaywallCalls.forEach(call => {
        if (line.includes(call)) {
          // Check if in try block
          let inTry = false;
          for (let i = idx; i >= 0; i--) {
            if (lines[i].includes('try {')) { inTry = true; break; }
            if (lines[i].includes('function') || lines[i].includes('=>') || lines[i].includes('async')) break;
          }

          if (!inTry) {
            this.issues.push({
              file: filePath,
              line: idx + 1,
              type: 'PAYWALL_CALL_NO_TRY_CATCH',
              severity: 'WARNING',
              provider: provider.name,
              message: `${call}() called without try/catch`,
              suggestion: 'Wrap in try/catch - paywall calls can fail (network, user cancel, etc.)'
            });
          }
        }
      });
    });
  }

  checkCommonMistakes(filePath, content, lines, provider, providerKey) {
    lines.forEach((line, idx) => {
      // RevenueCat: Debug mode in production
      if (providerKey === 'revenuecat' && line.includes('setDebugLogsEnabled(true)')) {
        this.issues.push({
          file: filePath,
          line: idx + 1,
          type: 'REVENUECAT_DEBUG_IN_PROD',
          severity: 'WARNING',
          provider: provider.name,
          message: 'RevenueCat debug logs enabled - disable in production',
          suggestion: 'Use setDebugLogsEnabled(false) in production builds'
        });
      }

      // RevenueCat: Not setting user ID
      if (providerKey === 'revenuecat' && line.includes('Purchases.configure') && !content.includes('Purchases.logIn') && !content.includes('Purchases.identify')) {
        // This is OK for anonymous users, but worth noting
      }

      // Stripe: Using test key in production-like code
      if (providerKey === 'stripe' && line.includes('sk_test_') && (line.includes('production') || line.includes('prod'))) {
        this.issues.push({
          file: filePath,
          line: idx + 1,
          type: 'STRIPE_TEST_KEY_IN_PROD',
          severity: 'ERROR',
          provider: provider.name,
          message: 'Stripe test key used in production context',
          suggestion: 'Use live key (sk_live_) in production'
        });
      }

      // Missing webhook secret
      if (providerKey === 'stripe' && line.includes('webhook') && !content.includes('STRIPE_WEBHOOK_SECRET') && !content.includes('webhook_secret')) {
        this.issues.push({
          file: filePath,
          line: idx + 1,
          type: 'STRIPE_MISSING_WEBHOOK_SECRET',
          severity: 'WARNING',
          provider: provider.name,
          message: 'Stripe webhook endpoint missing secret configuration',
          suggestion: 'Add STRIPE_WEBHOOK_SECRET to environment variables'
        });
      }

      // RevenueCat: Not handling offerings empty
      if (providerKey === 'revenuecat' && line.includes('getOfferings') && !content.includes('offerings.all') && !content.includes('offerings.current')) {
        this.issues.push({
          file: filePath,
          line: idx + 1,
          type: 'REVENUECAT_OFFERINGS_NOT_HANDLED',
          severity: 'INFO',
          provider: provider.name,
          message: 'Offerings fetched but not checked for empty state',
          suggestion: 'Check if offerings.current exists before showing paywall'
        });
      }
    });
  }

  checkCrossFileConsistency(filePath, content, detectedProviders) {
    // This would check across files in a real implementation
    // For now, just check within the file
  }
}

module.exports = { PaywallConnectionAnalyzer };