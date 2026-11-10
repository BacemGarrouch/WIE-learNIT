// background.js - Background service worker with multi-platform support
chrome.runtime.onInstalled.addListener(() => {
  console.log('🤟 WIE-learnIT Sign Language Extension installed');
  console.log('✅ Platforms supported: Google Meet, Zoom, Microsoft Teams');
  
  // Initialize storage
  chrome.storage.local.set({
    isRecognizing: false,
    recentSigns: [],
    settings: {
      showOverlay: true,
      autoPhrase: false,
      soundAlerts: false,
      minConfidence: 0.65
    }
  });
});

// Listen for tab updates (when user navigates to supported platforms)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const url = tab.url || '';
    
    // Check if it's a supported education platform
    const platforms = {
      'meet.google.com': '📗 Google Meet',
      'zoom.us': '🔵 Zoom',
      'teams.microsoft.com': '🟣 Microsoft Teams'
    };
    
    let detectedPlatform = null;
    
    for (const [domain, name] of Object.entries(platforms)) {
      if (url.includes(domain)) {
        detectedPlatform = name;
        break;
      }
    }
    
    if (detectedPlatform) {
      console.log(`${detectedPlatform} detected:`, url);
      
      // Show page action icon
      chrome.action.setIcon({
        path: {
          16: 'icons/icon16.png',
          48: 'icons/icon48.png',
          128: 'icons/icon128.png'
        },
        tabId: tabId
      });
      
      // Set badge with platform indicator
      const platformEmojis = {
        'Google Meet': 'G',
        'Zoom': 'Z',
        'Microsoft Teams': 'T'
      };
      
      const badge = platformEmojis[detectedPlatform.split(' ')[1]] || '✓';
      
      chrome.action.setBadgeText({ 
        text: badge,
        tabId: tabId 
      });
      
      chrome.action.setBadgeBackgroundColor({ 
        color: '#4ade80',
        tabId: tabId
      });
    }
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Proxy backend calls for content scripts. Requests made from the extension
  // (which has host_permissions for localhost:5001) avoid Chrome's Local Network
  // Access prompt and CORS, which block fetches made directly from the meeting page.
  if (message.action === 'API_REQUEST') {
    fetch(`http://localhost:5001${message.path}`, {
      method: message.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: message.body ? JSON.stringify(message.body) : undefined
    })
      .then(async (response) => {
        let data = null;
        try { data = await response.json(); } catch (e) { /* non-JSON body */ }
        sendResponse({ ok: response.ok, status: response.status, data });
      })
      .catch((error) => sendResponse({ ok: false, status: 0, error: error.message }));
    return true;
  }

  if (message.action === 'SIGN_DETECTED') {
    // Forward to popup if it's open
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup is closed, that's okay
    });
    
    // Store in history
    chrome.storage.local.get(['recentSigns'], (result) => {
      const signs = result.recentSigns || [];
      signs.push({
        sign: message.sign,
        timestamp: Date.now(),
        platform: message.platform || 'unknown'
      });
      
      // Keep only last 50 signs
      if (signs.length > 50) {
        signs.shift();
      }
      
      chrome.storage.local.set({ recentSigns: signs });
    });
    
    sendResponse({ status: 'received' });
  }
  
  return true; // Keep message channel open for async response
});

// Periodic health check of backend
let healthCheckInterval = setInterval(async () => {
  try {
    const response = await fetch('http://localhost:5001/health');
    const data = await response.json();
    
    if (data.status === 'healthy') {
      // Update badge to show system is ready
      chrome.action.setBadgeBackgroundColor({ color: '#4ade80' });
      
      // Set tooltip
      chrome.action.setTitle({ 
        title: `WIE-learnIT Ready\nDatabase: ${data.database_size} signs` 
      });
    }
  } catch (error) {
    // Backend is offline
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#f87171' });
    chrome.action.setTitle({ 
      title: 'WIE-learnIT - Backend Offline\nPlease start: python backend_api.py' 
    });
  }
}, 10000); // Check every 10 seconds

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup automatically
  console.log('Extension icon clicked on tab:', tab.id);
});

console.log('✅ WIE-learnIT background service worker ready');
console.log('📚 Supporting: Google Meet, Zoom, Microsoft Teams');