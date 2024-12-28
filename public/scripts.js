document.addEventListener('DOMContentLoaded', () => {
  // Grab references
  const twitterLoginBtn   = document.querySelector('.twitter-login-btn');
  const logoutBtn         = document.getElementById('logout-btn');

  const tipForm           = document.getElementById('tip-form');
  const tipResult         = document.getElementById('tip-result');
  const amountButtons     = document.querySelectorAll('.amount-btn');
  const customAmountInput = document.getElementById('custom-amount');
  const commentInput      = document.getElementById('comment');
  const tweetUrlInput     = document.getElementById('tweet-url');
  const recipientUsernameInput = document.getElementById('recipient-username');

  const loadingEl         = document.getElementById('loading');
  const errorMessageEl    = document.getElementById('error-message');

  const userProfileSection= document.getElementById('user-profile-section');
  const homeSection       = document.getElementById('home-section');
  const updateProfileForm = document.getElementById('update-profile-form');
  const receivedTipsEl    = document.getElementById('received-tips');
  const sentTipsEl        = document.getElementById('sent-tips');

  // Modal
  const modal       = document.getElementById('tip-modal');
  const closeButton = document.querySelector('.close-button');
  const modalMessage= document.getElementById('modal-message');
  const modalQRCode = document.getElementById('modal-qr-code');
  const modalAddress= document.getElementById('modal-address');

  // read from localStorage
  let accessToken     = localStorage.getItem('access_token') || null;
  let twitterUsername = localStorage.getItem('twitter_username') || null;

  // On load, parse ?access_token= & ?twitter_username= from the URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('access_token') && urlParams.has('twitter_username')) {
    accessToken     = urlParams.get('access_token');
    twitterUsername = urlParams.get('twitter_username');
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('twitter_username', twitterUsername);
    window.history.replaceState({}, document.title, "/");
  }

  updateUI();
  if (accessToken && twitterUsername) {
    fetchUserProfile();
  }

  // 1) Login with Twitter
  twitterLoginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log("Twitter login button clicked!");

    try {
      showLoading();
      console.log("Fetching the auth URL from backend...");

      const resp = await fetch('https://api.zap-zap.me/auth/twitter/login');
      console.log("Fetch completed with status:", resp.status);

      if (!resp.ok) {
        throw new Error(`Failed to get Twitter login URL (status: ${resp.status})`);
      }
      const data = await resp.json();
      console.log("Received data from /auth/twitter/login:", data);

      if (!data.authorization_url) {
        throw new Error("No authorization_url in response");
      }

      console.log("Redirecting user to:", data.authorization_url);
      window.location.href = data.authorization_url;

    } catch (error) {
      console.error(error);
      showError(error.message || 'Error initiating Twitter login');
    } finally {
      hideLoading();
    }
  });

  // 2) Logout
  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    accessToken = null;
    twitterUsername = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('twitter_username');
    updateUI();
  });

  // 3) Submit Tip Form
  tipForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tweetUrl   = tweetUrlInput.value.trim();
    const recipientTyped = recipientUsernameInput.value.trim().replace('@',''); // remove "@" if any
    const amount     = parseInt(customAmountInput.value.trim() || "0", 10);
    const comment    = commentInput.value.trim();

    // 3a) Validate amount
    if (!amount || amount <= 0) {
      showError('Please enter a valid amount in sats.');
      return;
    }

    // 3b) Determine final recipient username
    let finalRecipient = recipientTyped; 
    // If user didn't type any username, we parse from tweetURL
    if (!finalRecipient) {
      finalRecipient = extractUsernameFromTweet(tweetUrl);
    }

    if (!finalRecipient) {
      showError('Please enter a recipient username or a valid tweet URL.');
      return;
    }

    // 3c) Build tip data
    const tipData = {
      tweet_url: tweetUrl || "",
      amount_sats: amount,
      comment: comment,
      recipient_twitter_username: finalRecipient
    };

    // 3d) Send tip to backend
    try {
      showLoading();
      const headers = { 'Content-Type': 'application/json' };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch('https://api.zap-zap.me/tips/', {
        method: 'POST',
        headers,
        body: JSON.stringify(tipData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData?.detail) {
          if (typeof errorData.detail === 'string') {
            throw new Error(errorData.detail);
          } else {
            const errorMessages = Object.values(errorData.detail).flat().join(' ');
            throw new Error(errorMessages || 'Failed to create tip.');
          }
        }
        throw new Error('Failed to create tip.');
      }

      const tip = await response.json();
      displayTipResult(tip);
      tipForm.reset();
      amountButtons.forEach(button => button.classList.remove('selected'));
    } catch (error) {
      console.error('Error creating tip:', error);
      showError(error.message || 'An error occurred while creating the tip.');
    } finally {
      hideLoading();
    }
  });

  // 4) Amount Buttons
  amountButtons.forEach(button => {
    button.addEventListener('click', () => {
      const amt = button.getAttribute('data-amount');
      customAmountInput.value = amt;
      highlightSelectedAmount(button);
    });
  });
  customAmountInput.addEventListener('input', () => {
    amountButtons.forEach(btn => btn.classList.remove('selected'));
  });

  // 5) Close Modal
  closeButton.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  // 6) Update Profile Form
  updateProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bolt12Address = document.getElementById('bolt12-address').value.trim();
    if (!bolt12Address) {
      showError('Please enter a valid BOLT12 address.');
      return;
    }
    try {
      showLoading();
      if (!accessToken) {
        throw new Error("Not authenticated. Please login first.");
      }

      const response = await fetch('https://api.zap-zap.me/users/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ bolt12_address: bolt12Address })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData?.detail) {
          if (typeof errorData.detail === 'string') {
            throw new Error(errorData.detail);
          } else {
            const errorMessages = Object.values(errorData.detail).flat().join(' ');
            throw new Error(errorMessages || 'Failed to update profile.');
          }
        }
        throw new Error('Failed to update profile.');
      }

      showError('Profile updated successfully.');
      fetchUserProfile();
    } catch (err) {
      console.error('Error updating profile:', err);
      showError(err.message || 'Failed to update profile.');
    } finally {
      hideLoading();
    }
  });

  // HELPER: show/hide UI
  function updateUI() {
    if (accessToken && twitterUsername) {
      twitterLoginBtn.style.display = 'none';
      logoutBtn.style.display       = 'inline-flex';
      userProfileSection.style.display = 'block';
      homeSection.style.display        = 'none';
    } else {
      twitterLoginBtn.style.display = 'inline-flex';
      logoutBtn.style.display       = 'none';
      userProfileSection.style.display = 'none';
      homeSection.style.display        = 'block';
    }
  }

  // HELPER: parse from tweet URL
  function extractUsernameFromTweet(url) {
    try {
      const urlObj = new URL(url);
      const segments = urlObj.pathname.split('/');
      // e.g. /jack/status/12345 -> segments[1] = "jack"
      if (segments.length < 3) return '';
      return segments[1].replace('@','');
    } catch (err) {
      console.error('Invalid Tweet URL:', err);
      return '';
    }
  }

  // HELPER: Show the invoice & QR in a modal
  function displayTipResult(tip) {
    const qrCodeData = tip.bolt11_invoice || "No invoice?";

    // Generate QR code
    const qrCodeURL = generateQRCode(qrCodeData);

    modalMessage.textContent = `@${tip.recipient_twitter_username} has been tipped ${tip.amount_sats} sats!`;
    modalQRCode.src          = qrCodeURL;
    modalAddress.textContent = qrCodeData;
    modal.style.display      = 'block';
  }

  // HELPER: generate QR code Data URL
  function generateQRCode(data) {
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, data, { width: 200 }, (error) => {
      if (error) console.error(error);
    });
    return canvas.toDataURL('image/png');
  }

  // HELPER: highlight selected sat amount
  function highlightSelectedAmount(selectedButton) {
    amountButtons.forEach(btn => btn.classList.remove('selected'));
    selectedButton.classList.add('selected');
  }

  // HELPER: show/hide loading
  function showLoading() {
    loadingEl.style.display = 'flex';
  }
  function hideLoading() {
    loadingEl.style.display = 'none';
  }

  // HELPER: show an error
  function showError(msg) {
    errorMessageEl.querySelector('p').textContent = msg;
    errorMessageEl.style.display = 'block';
    setTimeout(() => {
      errorMessageEl.style.display = 'none';
    }, 5000);
  }

  // HELPER: fetch user profile
  async function fetchUserProfile() {
    try {
      showLoading();
      const userResponse = await fetch('https://api.zap-zap.me/users/', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!userResponse.ok) {
        throw new Error('Failed to fetch user profile.');
      }
      const users = await userResponse.json();
      // find the one that matches our twitterUsername
      const user = users.find(u => u.twitter_username === twitterUsername);
      if (user) {
        document.getElementById('bolt12-address').value = user.bolt12_address || '';
      }

      // fetch all tips
      const tipsResp = await fetch('https://api.zap-zap.me/tips/', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!tipsResp.ok) {
        throw new Error('Failed to fetch tips');
      }
      const tips = await tipsResp.json();

      // filter tips received
      const received = tips.filter(t => t.recipient_twitter_username === twitterUsername);
      displayTips(receivedTipsEl, received, 'received');

      // filter tips sent
      if (user) {
        const sent = tips.filter(t => t.tipper_user_id === user.id);
        displayTips(sentTipsEl, sent, 'sent');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      showError(error.message || 'Failed to load user profile.');
    } finally {
      hideLoading();
    }
  }

  // HELPER: display tips
  function displayTips(container, tips, type) {
    if (!tips || !tips.length) {
      container.innerHTML = `<p>No ${type} tips found.</p>`;
      return;
    }
    container.innerHTML = '';
    tips.forEach(tip => {
      const div = document.createElement('div');
      div.classList.add('tip-card');
      div.innerHTML = `
        <h4>@${tip.recipient_twitter_username}</h4>
        <p>Amount: ${tip.amount_sats} sats</p>
        <p>Comment: ${tip.comment || 'No comment'}</p>
        <p>Date: ${new Date(tip.created_at).toLocaleString()}</p>
        <p>Tweet: <a href="${tip.tweet_url}" target="_blank">${tip.tweet_url}</a></p>
      `;
      container.appendChild(div);
    });
  }
});
