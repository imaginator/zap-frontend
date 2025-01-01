document.addEventListener('DOMContentLoaded', () => {
  // Grab references
  const twitterLoginBtn   = document.querySelector('.twitter-login-btn');
  const logoutBtn         = document.getElementById('logout-btn');
  const profileBtn        = document.getElementById('profile-btn');
  const welcomeMessage = document.getElementById('welcome-message');
  const accountName = document.getElementById('account-name');

  const updateBolt12Btn = document.getElementById('update-bolt12-btn');
  const updateBolt12Form = document.getElementById('update-bolt12-form');


  const tipForm           = document.getElementById('tip-form');
  const tipResult         = document.getElementById('tip-result');
  const amountButtons     = document.querySelectorAll('.amount-btn');
  const customAmountInput = document.getElementById('custom-amount');
  const commentInput      = document.getElementById('comment');
  const tweetUrlInput     = document.getElementById('tweet-url');

  const loadingEl         = document.getElementById('loading');
  const errorMessageEl    = document.getElementById('error-message');

  const userProfileSection= document.getElementById('user-profile-section');
  const homeSection       = document.getElementById('home-section');
  const updateProfileForm = document.getElementById('update-profile-form');
  const receivedTipsEl    = document.getElementById('received-tips');
  const sentTipsEl        = document.getElementById('sent-tips');
  const backHomeBtn       = document.getElementById('back-home-btn');

  // Modal
  const modal       = document.getElementById('tip-modal');
  const closeButton = document.querySelector('.close-button');
  const modalMessage= document.getElementById('modal-message');
  const modalQRCode = document.getElementById('modal-qr-code');
  const modalAddress= document.getElementById('modal-address').querySelector('span');

  const userProfileHeader = document.getElementById('user-profile-header');


  // read from localStorage
  let accessToken     = localStorage.getItem('access_token') || null;
  let twitterUsername = localStorage.getItem('twitter_username') || null;

  updateBolt12Btn.addEventListener('click', () => {
    const isVisible = updateBolt12Form.style.display === 'block';
    updateBolt12Form.style.display = isVisible ? 'none' : 'block';
  });

  // Submit the BOLT12 address update
  updateBolt12Form.addEventListener('submit', async (e) => {
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
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bolt12_address: bolt12Address }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData?.detail) {
          if (typeof errorData.detail === 'string') {
            throw new Error(errorData.detail);
          } else {
            const errorMessages = Object.values(errorData.detail).flat().join(' ');
            throw new Error(errorMessages || 'Failed to update BOLT12 address.');
          }
        }
        throw new Error('Failed to update BOLT12 address.');
      }
      showSuccess('BOLT12 address updated successfully.');
      updateBolt12Form.style.display = 'none'; // Hide form after successful update
      fetchUserProfile(); // Refresh profile data
    } catch (err) {
      console.error('Error updating BOLT12 address:', err);
      showError(err.message || 'Failed to update BOLT12 address.');
    } finally {
      hideLoading();
    }
  });


  // On load, parse ?token= from the URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('token')) {
    accessToken = urlParams.get('token');
    localStorage.setItem('access_token', accessToken);
    // Remove token from URL
    window.history.replaceState({}, document.title, "/");
    // Fetch user profile to get twitterUsername
    fetchUserProfile();
  }

  // Initialize UI
  updateUI();

  // If the user is already logged in, fetch their profile
  if (accessToken && !twitterUsername) {
    fetchUserProfile();
  }

  // 1) Login with Twitter
  twitterLoginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      showLoading();
      const resp = await fetch('https://api.zap-zap.me/auth/twitter/login');
      if (!resp.ok) {
        throw new Error(`Failed to get Twitter login URL (status: ${resp.status})`);
      }
      const data = await resp.json();
      if (!data.authorization_url) {
        throw new Error("No authorization_url in response");
      }
      // Redirect user to Twitter for login
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

  // 3) Profile Button => show user profile
  profileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!accessToken) {
      showError('Not logged in. Please login first.');
      return;
    }
    // Hide home section, show profile
    homeSection.style.display = 'none';
    userProfileSection.style.display = 'block';
    fetchUserProfile();
  });

  // 4) Back to Home
  backHomeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    userProfileSection.style.display = 'none';
    homeSection.style.display = 'block';
  });

  // 5) Submit Tip Form
  tipForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tweetUrl   = tweetUrlInput.value.trim();
    const amount     = parseInt(customAmountInput.value.trim() || "0", 10);
    const comment    = commentInput.value.trim();

    if (!tweetUrl) {
      showError('Please enter a valid Tweet URL.');
      return;
    }

    if (!amount || amount <= 0) {
      showError('Please enter a valid amount in sats.');
      return;
    }

    // Parse recipient from tweet URL
    let finalRecipient = extractUsernameFromTweet(tweetUrl);
    if (!finalRecipient) {
      showError('Please enter a valid Tweet URL containing username/status.');
      return;
    }

    // Build request body
    const tipData = {
      tweet_url: tweetUrl,
      recipient_twitter_username: finalRecipient,
      amount_sats: amount,
      comment: comment
    };

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

  // 6) Amount Buttons
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

  // 7) Close Modal
  closeButton.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  // 8) Update Profile Form
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

      showSuccess('Profile updated successfully.');
      fetchUserProfile();
    } catch (err) {
      console.error('Error updating profile:', err);
      showError(err.message || 'Failed to update profile.');
    } finally {
      hideLoading();
    }
  });

  /** ========== UTILS ========== **/

  function updateUI() {
    if (accessToken && twitterUsername) {
      // Logged in
      twitterLoginBtn.style.display = 'none'; // Hide login button
      logoutBtn.style.display = 'inline-flex'; // Show logout button
      profileBtn.style.display = 'inline-flex'; // Show profile button
      welcomeMessage.style.display = 'inline'; // Show welcome message
      accountName.textContent = twitterUsername; // Set account name
    } else {
      // Not logged in
      twitterLoginBtn.style.display = 'inline-flex'; // Show login button
      logoutBtn.style.display = 'none'; // Hide logout button
      profileBtn.style.display = 'none'; // Hide profile button
      welcomeMessage.style.display = 'none'; // Hide welcome message
      accountName.textContent = ''; // Clear account name
    }
  }
  

  function extractUsernameFromTweet(url) {
    try {
      const urlObj = new URL(url);
      const segments = urlObj.pathname.split('/');
      // e.g. /jack/status/12345 -> segments[1] = "jack"
      if (segments.length < 3) return '';
      return segments[1].replace('@','');
    } catch (err) {
      return '';
    }
  }

  function displayTipResult(tip) {
    const qrCodeData = tip.bolt11_invoice || "No invoice?";
    const qrCodeURL  = generateQRCode(qrCodeData);
    modalMessage.textContent = `@${tip.recipient_twitter_username} has been tipped ${tip.amount_sats} sats!`;
    modalQRCode.src          = qrCodeURL;
    modalAddress.textContent = qrCodeData;
    modal.style.display      = 'block';
  }

  function generateQRCode(data) {
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, data, { width: 200 }, (error) => {
      if (error) console.error(error);
    });
    return canvas.toDataURL('image/png');
  }

  function highlightSelectedAmount(selectedButton) {
    amountButtons.forEach(btn => btn.classList.remove('selected'));
    selectedButton.classList.add('selected');
  }

  function showLoading() {
    loadingEl.style.display = 'flex';
  }

  function hideLoading() {
    loadingEl.style.display = 'none';
  }

  function showError(msg) {
    errorMessageEl.querySelector('p').textContent = msg;
    errorMessageEl.style.display = 'block';
    setTimeout(() => {
      errorMessageEl.style.display = 'none';
    }, 5000);
  }

  function showSuccess(msg) {
    errorMessageEl.querySelector('p').textContent = msg;
    errorMessageEl.style.background = '#43a047'; /* Green */
    errorMessageEl.style.display = 'block';
    setTimeout(() => {
      errorMessageEl.style.display = 'none';
      errorMessageEl.style.background = '#e53935'; /* Reset to default */
    }, 5000);
  }

  async function fetchUserProfile() {
    try {
      showLoading();
      const userResponse = await fetch('https://api.zap-zap.me/users/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!userResponse.ok) {
        throw new Error('Failed to fetch user profile.');
      }
      const user = await userResponse.json();

      if (user) {
        twitterUsername = user.twitter_username;
        localStorage.setItem('twitter_username', twitterUsername);

      // Update profile header
      userProfileHeader.textContent = `Welcome, @${twitterUsername}`;

        // Now fetch all tips
        const tipsResp = await fetch('https://api.zap-zap.me/tips/', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!tipsResp.ok) {
          throw new Error('Failed to fetch tips');
        }
        const tips = await tipsResp.json();

        // Filter only paid-in tips for the user
        const received = tips.filter(
          (t) =>
            t.recipient_twitter_username === twitterUsername && Boolean(t.paid_in)
        );
        displayTips(receivedTipsEl, received, 'received');

        // Filter tips sent
        const sent = tips.filter(t => t.tipper_user_id === user.id);
        displayTips(sentTipsEl, sent, 'sent');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      showError(error.message || 'Failed to load user profile.');
    } finally {
      hideLoading();
      updateUI();
    }
  }

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
