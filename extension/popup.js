// popup.js - WIE-learnIT extension control logic with multi-platform support
const API_URL = 'http://localhost:5001';

const SUPPORTED_PLATFORMS = [
  { host: 'meet.google.com', name: 'Google Meet' },
  { host: 'zoom.us', name: 'Zoom' },
  { host: 'teams.microsoft.com', name: 'Microsoft Teams' }
];

let isRecognizing = false;
let recentSigns = [];
let currentPlatform = 'Unknown';

const $ = (id) => document.getElementById(id);

function setStatus(dotId, textId, color, text) {
  $(dotId).className = color ? `dot ${color}` : 'dot';
  $(textId).textContent = text;
}

function showNotice(html) {
  const notice = $('notice');
  notice.innerHTML = html;
  notice.hidden = false;
}

function hideNotice() {
  $('notice').hidden = true;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Detect current platform
async function detectPlatform() {
  try {
    const tab = await getActiveTab();
    const url = (tab && tab.url) || '';
    const match = SUPPORTED_PLATFORMS.find(p => url.includes(p.host));
    currentPlatform = match ? match.name : 'Unknown';
  } catch (error) {
    console.error('Error detecting platform:', error);
    currentPlatform = 'Unknown';
  }

  if (currentPlatform === 'Unknown') {
    setStatus('platformDot', 'platformStatus', 'yellow', 'Not supported');
  } else {
    setStatus('platformDot', 'platformStatus', 'green', currentPlatform);
  }
}

// Check server status
async function checkServerStatus() {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();

    if (data.status === 'healthy') {
      setStatus('serverDot', 'serverStatus', 'green', `Connected · ${data.database_size} signs`);
      return true;
    }
  } catch (error) {
    // fall through to offline
  }
  setStatus('serverDot', 'serverStatus', 'red', 'Offline');
  return false;
}

// Reflect running / stopped state in the UI
function renderRecognitionState() {
  const toggleBtn = $('toggleBtn');
  toggleBtn.classList.toggle('running', isRecognizing);
  $('toggleText').textContent = isRecognizing ? 'Stop Recognition' : 'Start Recognition';

  if (isRecognizing) {
    setStatus('videoDot', 'videoStatus', 'green', 'Active');
    setStatus('recognitionDot', 'recognitionStatus', 'green', `Running on ${currentPlatform}`);
  } else {
    setStatus('videoDot', 'videoStatus', 'yellow', 'Inactive');
    setStatus('recognitionDot', 'recognitionStatus', 'yellow', 'Ready');
  }
}

// Toggle recognition
$('toggleBtn').addEventListener('click', async () => {
  hideNotice();

  const serverOnline = await checkServerStatus();
  if (!serverOnline) {
    showNotice('<strong>Backend server is offline.</strong><br>Start it with <code>python backend_api.py</code>');
    return;
  }

  const tab = await getActiveTab();
  const url = (tab && tab.url) || '';
  if (!SUPPORTED_PLATFORMS.some(p => url.includes(p.host))) {
    showNotice('<strong>Open a supported platform first:</strong><br>Google Meet, Zoom or Microsoft Teams.');
    return;
  }

  isRecognizing = !isRecognizing;
  renderRecognitionState();

  if (isRecognizing) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'START_RECOGNITION',
      settings: {
        showOverlay: $('overlayToggle').checked,
        autoPhrase: $('autoPhraseToggle').checked,
        soundAlerts: $('soundToggle').checked,
        minConfidence: 0.65
      }
    });
  } else {
    chrome.tabs.sendMessage(tab.id, { action: 'STOP_RECOGNITION' });
  }

  chrome.storage.local.set({ isRecognizing });
});

// Clear history
$('clearBtn').addEventListener('click', () => {
  recentSigns = [];
  updateRecentSigns();
  chrome.storage.local.set({ recentSigns: [] });
});

// Update recent signs display
function updateRecentSigns() {
  const signsList = $('signsList');

  if (recentSigns.length === 0) {
    signsList.innerHTML = '<span class="empty">No signs detected yet</span>';
    return;
  }

  signsList.innerHTML = recentSigns.slice(-10).reverse().map(signData => {
    const sign = typeof signData === 'string' ? signData : signData.sign;
    const platform = (signData && signData.platform) || '';
    return `<span class="sign-chip" title="${escapeHtml(platform)}">${escapeHtml(sign)}</span>`;
  }).join('');
}

// Listen for updates from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'SIGN_DETECTED') {
    recentSigns.push({
      sign: message.sign,
      platform: currentPlatform,
      timestamp: Date.now()
    });
    updateRecentSigns();
    chrome.storage.local.set({ recentSigns });
  }
});

// Initialize on load
(async function init() {
  await detectPlatform();

  chrome.storage.local.get(['isRecognizing', 'recentSigns'], (result) => {
    if (result.recentSigns) {
      recentSigns = result.recentSigns;
      updateRecentSigns();
    }
    isRecognizing = !!result.isRecognizing;
    renderRecognitionState();
  });

  await checkServerStatus();
  setInterval(checkServerStatus, 5000);
})();

console.log('✅ WIE-learnIT popup loaded');
