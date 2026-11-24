/**
 * English text. This file defines the shape every other language must match (`fil.ts` is checked against it), so a
 * string added here and missing there fails the typecheck.
 *
 * Text with values in it is a function, so each language can put the value where its grammar wants it.
 */
export const en = {
  common: {
    oneMoment: 'One moment…',
    pleaseWait: 'Please wait…',
    done: 'Done',
    ok: 'OK',
    tryAgain: 'Try again',
    pendingConfirmation: 'Pending confirmation',
    pendingConfirmationBody: 'Check History for an update before trying again.',
    dismiss: 'Dismiss',
    continue: 'Continue',
    cancel: 'Cancel',
    back: 'Go back',
    required: 'Input is required',
    checking: 'Checking…',
    copied: 'Copied!',
    gotIt: 'Got it',
    mascot: 'Honi, the HoneBill mascot',
    noPhone: 'This account has no phone number on this device.',
    tryLater: 'Please try again later',
    invalidEmail: 'Enter a valid email address',
    sessionExpired: 'Session expired',
    keepOpen: 'Please keep the app open. This can take up to a minute.',
    swipeToEnter: 'Swipe to enter',
    confirmMpinTitle: 'Confirm with your MPIN',
    vaultUnavailable: 'Vault address unavailable',
    vaultCopied: 'Vault address copied',
    copyVault: 'Copy vault address',
    notAvailableYet: 'Not available yet',
    hello: (name: string) => `Hello, ${name}!`,
    openDownloadFailed: 'Could not open the download',
  },

  onboarding: {
    phoneTitle: 'Enter your phone number',
    phoneSignin: 'Enter the mobile number linked to your HoneBill account',
    phoneSignup: 'Link your mobile number to set up your online and offline accounts',
    hasAccount: 'This number already has an account. Go back and sign in.',
    mobileNumber: 'Mobile number',
    termsA11y: 'Terms and Conditions. Opens the terms to read.',
    agreed: 'You agreed to the ',
    readAgree: 'Read and agree to the ',
    readTerms: 'Read Terms to Continue',
    otpTitle: 'Verify OTP',
    otpSent: (phone: string) => `We sent a verification code to your mobile number: ${phone}`,
    otpA11y: 'One-time code',
    noOtp: "Didn't get an OTP? ",
    sendingNew: 'Sending a new code…',
    detailsTitle: 'User Details',
    detailsSubtitle: 'Enter details to complete registration',
    tooLong: (max: number) => `At most ${max} characters`,
    firstName: 'First name',
    lastName: 'Last name',
    firstNameExample: 'e.g. Juan',
    lastNameExample: 'e.g. Dela Cruz',
    verifyAgain: 'Please verify your number again to continue.',
    walletFailed: 'We could not create your secure wallet on this device. Please try again.',
    mpinTitle: 'Secure Your Account',
    mpinSubtitle: 'Create a 4-digit PIN to protect your device',
    mpinA11y: 'New 4-digit PIN',
    creatingVault: 'Creating your vault…',
    confirmPin: 'Confirm 4-digit PIN',
    verifyAgainFinish: 'Please verify your number again to finish creating your account.',
    verificationExpired: 'Verification expired',
    verifyPhoneAgain: 'Please verify your phone number again.',
    detailsRejected: 'Some of your details were rejected. Please start over and check your name and email.',
    createFailed: 'We could not create your account. Please try again.',
    securedTitle: 'Vault Secured',
    securedSubtitle: 'Your device is now primed for offline zero data transactions.',
    creatingAccount: 'Creating your account…',
    enter: 'Enter HoneBill',
    step: (n: number) => `Step ${n} of 4`,
  },

  pinDialog: {
    a11y: 'Enter your 4-digit MPIN',
  },

  keypad: {
    fingerprint: 'Sign in with fingerprint',
    delete: 'Delete',
  },

  profile: {
    logout: 'Log out',
    addressCopied: 'Address copied!',
    version: (v: string) => `HoneBill version ${v}. See what's new`,
    whatsNew: "What's new",
    signOutTitle: 'Sign out?',
    signOutBody: "You'll need your MPIN (or fingerprint) to get back in.",
    signOut: 'Sign out',
    stay: 'Stay signed in',
  },

  accountSettings: {
    emailTaken: 'This email is already used by another account.',
    resetHold: (wait: string) => `For your security, your email can't be changed for ${wait} after an MPIN reset.`,
    recentChange: (wait: string) => `You changed your email recently. You can change it again in ${wait}.`,
    notSaved: 'Your email was not saved',
    subtitle: 'You can update the email on your account.',
    notice: "For your security, we'll text a code to your number to confirm, and you can change your email once every 24 hours.",
    newEmail: 'New email address',
    name: 'Name',
    notAvailable: 'Not available',
    cannotChange: 'Your name, number and Short ID cannot be changed here.',
    saved: 'Saved! Your email is updated.',
    save: 'Save email',
    saving: 'Saving your email…',
    pinMessage: "Enter your 4-digit MPIN. We'll then text a code to your number.",
  },

  changeMpin: {
    currentSubtitle: 'First, enter your current 4-digit MPIN.',
    currentLabel: 'Current 4-digit MPIN',
    newSubtitle: 'Now choose a new 4-digit MPIN.',
    mustDiffer: 'Your new MPIN must be different from the current one.',
    recent: (wait: string) => `You changed your MPIN recently. You can change it again in ${wait}.`,
    notChanged: 'Your MPIN was not changed.',
    backToSettings: 'Back to settings',
    notice:
      "For your security, we'll text a code to your number to confirm, and you can change your MPIN once every 24 hours. You'll sign in again with the new MPIN.",
  },

  vault: {
    subtitle: 'Your wallet address, recovery phrase and offline payments.',
    noPhrase: 'This phone does not hold the recovery phrase for this account.',
    readFailed: 'We could not read the recovery phrase on this phone.',
    biometricPrompt: 'Show your recovery phrase',
    copyAddress: 'Copy address',
    warning: 'Anyone with these 12 words can take your money. Never share them. They hide again in a minute.',
    hide: 'Hide',
    explain: 'These 12 words restore your wallet on a new phone. We will ask for your fingerprint or MPIN before showing them.',
    show: 'Show recovery phrase',
    ready: 'Ready to pay without internet',
    notSetUp: 'Not set up on this phone yet',
    setUpHint: 'Set this up once while you are online, so you can send money later with no connection.',
    connectToSetUp: 'Connect to the internet to set this up.',
    settingUp: 'Setting up…',
    setUpNow: 'Set up now',
    pinMessage: 'Enter your 4-digit MPIN to show your recovery phrase.',
  },

  comingSoon: {
    body: (feature: string) => `${feature} is not available for now. We are working on it, so please check back soon.`,
    meantime: 'In the meantime, you can send with HoneBill.',
  },

  update: {
    title: 'Update HoneBill to continue',
    unsupported: (current: string, minimum: string) =>
      `This version (${current}) is no longer supported. Install version ${minimum} or newer to keep using your wallet.`,
    safe: 'Your money is safe. Install the new version over this one and your wallet stays on this phone.',
    askSupport: 'Ask HoneBill support for the download link of the latest version.',
    download: 'Download the update',
    checkAgain: 'Check again',
  },

  inbox: {
    subtitle: 'Check your updates here',
    latest: 'Latest',
    empty: 'Nothing to see here!\nYour updates will land here.',
    unread: 'Unread. ',
    updateAvailable: 'Update available',
    askSupport: 'Ask HoneBill support for the download link of the new version.',
  },

  feedback: {
    categories: {
      payment: { label: 'Payment problem', placeholder: 'e.g. I sent ₱500 by SMS yesterday and it has not arrived.' },
      account: { label: 'Account or sign-in', placeholder: 'e.g. My MPIN is not accepted after I changed it.' },
      bug: { label: "Something isn't working", placeholder: 'Tell us what you were doing and what happened.' },
      suggestion: { label: 'Suggestion', placeholder: 'What would make HoneBill better for you?' },
    },
    moreDetail: 'Please tell us a little more.',
    saveFailed: 'Your report could not be saved. Please try again when you are online.',
    sentTitle: 'Thank you! Your report was sent.',
    sentBody: "Our team reads every report. We can't reply in the app yet, but your report helps us fix problems faster.",
    queuedTitle: "Saved. We'll send it when you're back online.",
    queuedBody: 'Your report is kept on this phone and goes out automatically the next time you have a connection.',
    subtitle: 'Tell us about a problem or an idea. We read every report.',
    txA11y: 'The payment this report is about',
    aboutPayment: 'About this payment',
    whatAbout: 'What is it about?',
    yourMessage: 'Your message',
    offline: "You're offline. Your report will be saved and sent when you're back online.",
    privacy:
      'We include your Short ID, the app version and your phone type so we can look into it. Never share your MPIN or recovery phrase, not even with us.',
    sending: 'Sending…',
    send: 'Send report',
  },

  qrScan: {
    notHoneBillTitle: 'Not a HoneBill code',
    notHoneBillBody: 'This QR code is not a HoneBill payment code.',
    ownTitle: 'Your own code',
    ownBody: "You can't send money to yourself.",
    offlineTitle: "You're offline",
    offlineBody: 'Switch to "Send via offline" to pay this code by SMS.',
    noAccountTitle: 'No account found',
    noAccountBody: 'We could not find an account for this QR code.',
    checkFailed: 'Could not check the code',
    noQrTitle: 'No QR code found',
    noQrBody: 'We could not find a QR code in that image. Pick a clear, uncropped QR card.',
    readFailedTitle: 'Could not read the image',
    readFailedBody: 'Something went wrong while reading the QR code. Please try again.',
    title: 'Scan the QR Code',
    modeA11y: (mode: string, other: string) => `Sending ${mode}. Tap to switch to ${other}`,
    checking: 'Checking the code…',
    cameraOff: 'Camera access is off. Tap to open Settings.',
    point: 'Point your camera at the QR code, or upload a saved one.',
    uploadA11y: 'Upload QR from gallery',
    reading: 'Reading…',
    relayFailedTitle: 'Could not open your messages',
    relayFailedBody: 'No messaging app could be opened, so the payment was not sent. Please try again.',
    relayNoGatewayBody: 'The payment number is not set on this phone, so the payment cannot be sent from here.',
  },

  txDetail: {
    sentBySms: 'Sent by SMS, waiting for confirmation',
    stillNotConfirmed:
      'Still not confirmed. Connect to the internet to check, or look for a text from HoneBill with this reference.',
    willText: (ref: string) => `You will get a text from HoneBill with Ref ${ref} when it goes through or fails.`,
    couldNotConfirm: 'Could not be confirmed',
    didNotGoThrough: 'This payment did not go through',
    stillWaiting: 'Still waiting',
    waiting: 'Waiting for confirmation',
    received: 'Received',
    sent: 'Sent',
    shareMessage: (direction: string, amount: string, description: string, status: string, ref: string, when: string) =>
      `HoneBill receipt\n${direction} ${amount}\n${description}\nStatus: ${status}\nRef No. ${ref}\n${when}`,
    report: 'Report a problem',
    type: 'Type',
    source: 'Source',
    description: 'Description',
    amount: 'Amount',
  },

  history: {
    subtitle: 'Check your transaction\nhistory here',
    savedNote: (online: boolean, when: string) =>
      `${online ? 'Could not refresh.' : "You're offline."} Showing your last update, ${when}.`,
    empty: 'Nothing to see here!\nMake your first transaction!',
  },

  receive: {
    title: 'Request Amount',
    amountLabel: 'Amount to receive (PHPC)',
  },

  qrCard: {
    a11y: (name: string) => `HoneBill QR card for ${name}`,
    a11yAmount: (name: string, amount: string) => `HoneBill QR card for ${name}, requesting ${amount}`,
    user: 'HoneBill user',
    scanWith: 'Scan with the HoneBill app',
    pay: 'PAY',
    sendTo: 'SEND MONEY TO',
  },

  shortId: {
    copiedAnnounce: 'Short ID copied',
    hint: 'Copies the short ID',
  },

  balance: {
    chip: { idle: 'Loading', loading: 'Updating', ready: 'Synced', error: 'Not updated' },
    show: 'Show balance',
    hide: 'Hide balance',
    hidden: 'Balance hidden',
    loading: 'Loading balance',
    switchA11y: (mode: string, other: string) => `Showing ${mode} balance. Tap to switch to ${other} balance`,
  },

  quickActions: {
    toOffline: 'Transfer to Offline Balance',
    toOnline: 'Transfer to Online Balance',
  },

  nav: {
    scanA11y: 'Scan QR code',
  },

  loading: {
    lines: ['Fetching your honey…', 'Buzzing over to the server…', 'Counting your coins…', 'Polishing the honeycomb…', 'Almost there, hang tight!'],
  },

  crash: {
    title: 'Something went wrong',
    body: 'HoneBill hit an unexpected problem. Your wallet and any offline payments are safe on this device.',
  },

  language: {
    title: 'Language',
    hint: 'Choose the language for the app. Words like Send, MPIN and QR stay the same.',
  },

  time: {
    minutes: (n: number) => `${n} minute${n === 1 ? '' : 's'}`,
    hours: (n: number) => `${n} hour${n === 1 ? '' : 's'}`,
    justNow: 'just now',
    minutesAgo: (n: number) => `${n}m ago`,
    hoursAgo: (n: number) => `${n}h ago`,
    daysAgo: (n: number) => `${n}d ago`,
  },

  pin: {
    wrong: (left: number) => `Incorrect MPIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
    locked: (wait: string) => `Too many incorrect tries. Try again in ${wait}.`,
  },

  login: {
    enterMpin: 'Enter your MPIN',
    mpinChanged: 'MPIN changed. Enter your new MPIN',
    locked: 'Locked for your security. Enter your MPIN',
    signingIn: 'Signing in…',
    enterNumber: 'Enter your number',
    enterPhoneA11y: 'Enter your phone number',
    signingInAs: (phone: string) => `Signing in as ${phone}. Use another number`,
    forgot: 'Forgot MPIN?',
    forgotA11y: 'Forgot MPIN? Reset it',
    overlayTitle: 'Signing you in',
    stepPin: 'Checking your MPIN…',
    stepAccount: 'Opening your account…',
    stepWallet: 'Checking your wallet…',
    noWallet: "This phone doesn't have your wallet yet. Connect to the internet to restore it.",
    offlineNotSetUp: "You're offline. To use your MPIN offline, sign in with it once while online.",
    offlineNotSetUpFingerprint:
      "You're offline. To use your MPIN offline, sign in with it once while online. For now, use your fingerprint.",
    noMpinForNumber: 'No MPIN is set for this number. Tap the number to use another.',
    noAccount: 'No account found for this number.',
  },

  weakPin: {
    title: 'PIN not allowed',
    repeated: 'Four of the same digit, like 1111 or 2222, is one of the first things anyone tries.',
    sequence: 'Digits in a row, like 1234 or 4321, are among the most common PINs and easy to guess.',
    common: 'That combination is one of the most commonly used PINs, so it is easy to guess.',
    advice: 'For your security, please create another PIN that is hard to guess and that only you know.',
    button: 'Create another PIN',
  },

  smsCode: {
    sendingTo: 'Sending a code to ',
    sentTo: 'We texted a 6-digit code to ',
    codeA11y: 'SMS verification code',
    enterCode: (length: number) => `Enter the ${length}-digit code.`,
    wrongCode: (left: number) => `Incorrect code. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
    checking: 'Checking…',
    didntGetIt: "Didn't get it? ",
    resend: 'Resend',
    sending: 'Sending…',
    resendIn: (seconds: number) => `Resend code in ${seconds}s`,
    verify: 'Verify',
  },

  forgotMpin: {
    title: 'Forgot MPIN',
    newSubtitle: 'Choose a new 4-digit MPIN.',
    newLabel: 'New 4-digit MPIN',
    confirmSubtitle: 'Enter the new MPIN once more to confirm.',
    confirmLabel: 'Confirm new 4-digit MPIN',
    offline: "You're offline. Connect to the internet to reset your MPIN.",
    noAccount: 'No account was found for this number.',
    codeExpired: 'Your code expired. We sent a new one.',
    mismatch: 'The two MPINs did not match. Choose your new MPIN again.',
    saving: 'Resetting your MPIN',
    checkingSubtitle: 'Checking your account…',
    blockedSubtitle: 'Your MPIN was not reset.',
    blockedTitle: "We couldn't continue",
    backToSignIn: 'Back to sign in',
    noWalletSubtitle: "This phone doesn't hold your wallet yet.",
    noWalletTitle: 'Restore your wallet first',
    noWalletBody:
      'To keep your money safe, an MPIN can only be reset from a phone that holds your wallet. Restore it with your 12-word recovery phrase, then tap "Forgot MPIN?" again.',
    restoreWallet: 'Restore my wallet',
    smsSubtitle: "Confirm it's you with the code we text to your number.",
    emailHold: "You'll sign in with this new MPIN. For your security, your email can't be changed for 24 hours after an MPIN reset.",
  },

  landing: {
    createAccount: 'Create an account',
  },

  home: {
    hello: (name: string) => `Hello, ${name}`,
    online: 'You are online',
    offline: 'You are offline',
    offlinePaymentsPending: 'Pending offline payments',
    held: (amount: string) => `${amount} is waiting to settle.`,
    balanceAsOf: (when: string) => `Balance as of ${when}`,
    checkBalanceSms: 'Check balance by SMS',
    checkBalanceSmsHint: 'Opens Messages. Send from the phone number registered to your HoneBill account.',
    checkBalanceSmsFailed: 'Could not open Messages',
    refreshFailed: 'Could not refresh. Pull down to try again.',
  },

  connectivity: {
    offlineTitle: "You're offline",
    offlineLines: [
      'Online features, like your Online Balance and moving money between your balances, are unavailable until your internet connection returns.',
      'You can still pay and receive with your Offline Balance.',
    ],
    restoredTitle: "You're back online",
    restoredLines: [
      'Online features are available again, and your balances and transactions are being updated.',
      'Tap your balance cards to switch to your Online Balance.',
    ],
    gotIt: 'Got it',
  },

  outcomes: {
    settled: (n: number) => `${n} offline payment${n === 1 ? '' : 's'} went through.`,
    failed: (n: number) => `${n} offline payment${n === 1 ? '' : 's'} did not go through. No money was taken.`,
    unconfirmed: (n: number) =>
      `${n} offline payment${n === 1 ? '' : 's'} could not be confirmed. Check your balance before sending again.`,
    failedTitle: (n: number): string => (n === 1 ? 'A payment did not go through' : 'Payments did not go through'),
    checkTitle: (n: number): string => (n === 1 ? 'A payment needs checking' : 'Payments need checking'),
    updatedTitle: 'Offline payments updated',
    view: 'View',
    viewA11y: 'View in History',
  },

  tx: {
    noMoneyTaken: 'No money was taken.',
    unconfirmedLabel: 'Unconfirmed',
    processingLabel: 'Processing',
    /** Stored on the payment in English (see `EXPIRED_REASON`); shown in the reader's language. */
    expired: 'It was not confirmed within 14 days, so it will not be tried again. Check your balance before sending it again.',
    retryClosed: 'HoneBill will not retry this payment online. The original SMS may still settle. Check History before sending again.',
    /** Why the server refused a voucher. Stored in English, shown in the reader's language. */
    reasons: {
      insufficientOfflineBalance: 'Your Offline balance was not enough for the amount plus the offline fee.',
      noAccount: 'No account has this ID.',
      notVerified: 'The payment could not be verified.',
      notSetUp: 'This phone was not set up for offline payments.',
      currency: 'This currency is not accepted right now.',
      senderMissing: 'Your account was not found.',
      notAccepted: 'The payment was not accepted.',
    },
  },

  send: {
    sendTo: 'Send to',
    self: "You can't send to yourself.",
    noInternetCheck: 'No internet connection, so this ID cannot be checked. Connect, or send offline instead.',
    noAccountForId: 'No account found for this ID.',
    recipientIdA11y: 'Recipient short ID',
    checkingId: 'Checking ID…',
    uncheckedTitle: 'Check this ID before you continue',
    continueWith: (id: string) => `Continue with ${id}`,
    uncheckedBody: (id: string) =>
      `You're offline, so we can't confirm ID ${id}. Ask the recipient to confirm it. A wrong ID will usually make the payment fail.`,
    methods: 'Methods',
    noRecents: 'No recent recipients yet.',
    noFavorites: 'No favorites yet. Tap a star to add one.',
    swipe: 'SWIPE TO  PROCEED',
    swipeA11y: (amount: string) => `Swipe to proceed with ${amount}`,
    swipeInvalidA11y: 'Swipe to proceed, enter a valid amount first',
    addFavorite: (name: string) => `Add ${name} to favorites`,
    removeFavorite: (name: string) => `Remove ${name} from favorites`,
    balanceAfter: (amount: string) => `Balance after: ${amount}`,
    available: (amount: string) => `Available Balance: PHP ${amount}`,
    noteLabel: 'Note (Optional)',
    noteA11y: 'Note, optional',
    notePlaceholder: 'e.g. Lunch, rent, pasalubong',
  },

  sendMethod: {
    title: 'Method',
    question: 'How do you want to send this?',
    smsTitle: 'Send Using My Phone',
    smsBody: 'Standard SMS charges apply. Active text promo required.',
    relayTitle: 'Get Help Sending',
    relayBody: "Don't have text load? Show your screen to a partner so they can scan it and send the text for you",
    prepareFailedTitle: 'Could not prepare the payment',
    noMessagingApp: 'No messaging app could be opened. No money has been moved.',
    relayQrTitle: 'Let your partner scan this',
    relayQrBody:
      'Your partner scans this with HoneBill or their phone camera, then taps Send on the text that opens. Their text load is used, and they cannot change the amount or who gets it.',
    relayQrA11y: 'Payment QR code for your partner to scan',
    relayTo: (name: string) => `to ${name}`,
    relayDone: 'My partner sent it',
    relayCancel: 'Close',
    relayFailed: 'Something went wrong while preparing the QR code. No money has been moved.',
    sentTitle: 'Did you send the text?',
    sentBody: (amount: string, name: string) =>
      `${amount} to ${name}. The amount stays set aside while HoneBill checks the payment.`,
    sentYes: 'Yes, I sent it',
    sentNo: 'Not yet',
    reviewSaveFailed: 'Could not save your choice. Please try again.',
  },

  verify: {
    title: 'Verification',
    noInternetTitle: 'No internet connection',
    noInternetBody: 'An online payment needs a connection. Switch to the Offline view on Home to pay with a voucher.',
    notSentTitle: 'Payment not sent',
    pendingTo: (name: string) => `Payment to ${name}`,
    swipe: 'SWIPE TO  AUTHORIZE',
    sending: 'SENDING…',
    processing: (amount: string, name: string) => `Sending ${amount} to ${name}`,
    sendingA11y: 'Sending, please wait',
    notEnoughA11y: 'Swipe to authorize, not enough balance',
    swipeA11y: 'Swipe to authorize',
    confirmFirstA11y: 'Swipe to authorize, confirm the details first',
    totalLabel: 'TOTAL TRANSFER AMOUNT',
    totalA11y: (amount: string) => `Total transfer amount ${amount}`,
    notEnough: (wallet: string) => `Not enough ${wallet} balance. Go back and lower the amount.`,
    recipientCaption: 'RECIPIENT ACCOUNT',
    senderCaption: 'SENDER ACCOUNT',
    uncheckedTitle: 'ID not checked',
    uncheckedBody: "You're offline, so this ID could not be confirmed. Make sure it is right before you authorize.",
    myWallet: 'My Wallet',
    myVault: 'My Vault Wallet',
    defaultMemo: 'Offline transaction',
    amountSent: 'Amount sent',
    recipientGets: 'Recipient gets',
    offlineFee: 'Offline fee',
    offlineFeeChanged: 'The offline fee changed. Go back to review and authorize the new total.',
    totalDeducted: 'Total deducted',
    confirm: 'I confirm that the recipient details and amount are correct.',
  },

  receipt: {
    title: 'Sent',
    smsTitle: 'Offline payment',
    returnHome: 'Return to Home',
    heading: 'Receipt Created',
    smsHandoff: 'Your payment is awaiting SMS confirmation. Check History for updates when you reconnect.',
    bySms: (ref: string) => `Your payment was sent by SMS.\nYou will get a text with Ref ${ref} when it goes through or fails.`,
    online: 'Your transaction is successful.\nSent via HoneBill',
    recipient: 'Recipient',
    amountSent: 'Amount sent',
    share: 'Share receipt',
    shareUnavailableTitle: 'Sharing unavailable',
    shareUnavailableBody: 'This phone cannot share files from the app.',
    shareFailedTitle: 'Could not share',
    shareFailedBody: 'Something went wrong while preparing the receipt. Please try again.',
  },

  errors: {
    generic: 'Something went wrong. Please try again.',
    timeout: 'The server took too long to respond. Please try again.',
    network: 'Cannot reach the server. Check your connection and try again.',
    requestFailed: (status: number) => `Request failed (${status}).`,
  },

  biometric: {
    prompt: 'Sign in to HoneBill',
    useMpin: 'Use MPIN',
  },

  whatsNew: {
    onVersion: (version: string) => `You're on HoneBill ${version}.`,
  },

  terms: {
    readAccepting: (minutes: number) => `A ${minutes}-minute read. HoneBill is a self-custody wallet, so please read all of it.`,
    read: (minutes: number) => `About a ${minutes}-minute read.`,
    scrollHint: (section: number, total: number) => `Scroll to the end to continue · Section ${section} of ${total}`,
    tickHint: 'Tick the box above to continue',
    highlights: 'These are only highlights. The full terms below are what you agree to.',
    agree: 'I Agree',
  },

  recovery: {
    neverShare: 'Never share these words with anyone.',
    readFailed: 'We could not read your recovery phrase from this device.',
    // Recovery phrase screen
    subtitle: 'Copy and save these 12 words somewhere secure.',
    copied: 'Copied',
    copy: 'Copy',
    copyA11y: 'Copy phrase',
    copiedAnnounce: 'Recovery phrase copied. The clipboard clears in 60 seconds.',
    wordA11y: (n: number, word: string) => `Word ${n}, ${word}`,
    loading: 'Loading your phrase…',
    reminderTitle: 'Security Reminder',
    reminderBody:
      'Never share these words with anyone. Store them in a secure, offline location such as a safe or a secure note-taking app.',
    saved: "I've Saved It",
    // Warning dialog
    dialogTitle: 'Protect your recovery phrase',
    dialogWhy: 'These 12 words are the only way to recover your account when you log in on another device or lose this phone.',
    dialogKeep:
      'Write them down and keep them somewhere safe. Never share them with anyone: HoneBill cannot recover them for you. You will be asked to confirm them next.',
    understand: (secondsLeft: number) => (secondsLeft > 0 ? `I understand (${secondsLeft})` : 'I understand'),
    // Restore on a new phone
    verifyTitle: 'Verify Seed Phrase',
    verifyIntro:
      'This phone does not have your wallet yet. Enter the 12-word recovery phrase you saved when you created your account. Paste all 12 words in one go. Never share these words with anyone.',
    clipboardFailed: 'Could not read the clipboard. Paste into the box manually.',
    wordCount: (need: number, have: number) => `Enter all ${need} words. You have ${have}.`,
    invalid: 'These words are not a valid recovery phrase. Check the spelling and the order.',
    notThisAccount: 'This recovery phrase does not belong to this account.',
    phraseA11y: 'Recovery phrase',
    pastePlaceholder: 'Paste your 12 words here',
    paste: 'Paste from clipboard',
    restoring: 'Restoring…',
    restore: 'Restore wallet',
    // Quiz after sign-up
    quizTitle: 'Confirm Seed Phrase',
    quizIntroAt: (position: number) =>
      `Enter the word at position #${position} to verify your recovery phrase. Never share these words with anyone.`,
    quizIntro: 'Enter a word from your recovery phrase to verify it. Never share these words with anyone.',
    question: (position: number) => {
      const v = position % 100;
      const suffix = ['th', 'st', 'nd', 'rd'];
      return `What was your ${position}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]} word?`;
    },
    wordLabel: (position: number) => `Word #${position}`,
    wordInputA11y: (position: number) => `Word number ${position}`,
    wordPlaceholder: 'Enter the word',
    required: 'Input is required',
    wrongWord: 'That is not the right word. Check your written copy and try again with new questions.',
    progressA11y: (current: number, total: number) => `Question ${current} of ${total}`,
    verify: 'Verify',
    preparing: 'Preparing your questions…',
  },

  amount: {
    unavailable: 'Balance unavailable',
    enter: 'Enter Amount',
    notEnough: 'Not enough balance',
    inPesos: 'Amount in pesos',
  },

  transfer: {
    swipe: 'SWIPE TO  PROCEED',
    transferring: 'TRANSFERRING…',
    transferringA11y: (amount: string) => `Transferring ${amount}, please wait`,
    swipeA11y: (amount: string) => `Swipe to transfer ${amount}`,
    swipeInvalidA11y: 'Swipe to proceed, enter a valid amount first',
    movingToOffline: (amount: string) => `Moving ${amount} to your offline vault`,
    movingToOnline: (amount: string) => `Moving ${amount} to your online wallet`,
    balanceAfter: (wallet: string, amount: string) => `${wallet} Balance after: ${amount}`,
    available: (wallet: string, amount: string) => `Available Balance ${wallet}: PHP ${amount}`,
    fromNote: (wallet: string) => `You are transferring funds from your ${wallet} wallet`,
    successTitle: 'Transfer complete',
    successBody: (amount: string, wallet: string) => `${amount} is now in your ${wallet} wallet.`,
    failTitle: 'Transfer not completed',
  },

  topUp: {
    swipe: 'SWIPE TO  TOP UP',
    stepLabel: {
      preparing: 'GETTING READY…',
      wallet: 'SETTING UP WALLET…',
      requesting: 'REQUESTING TOP-UP…',
      paying: 'ADDING FUNDS…',
    },
    stepText: {
      preparing: 'Getting ready…',
      wallet: 'Setting up your wallet…',
      requesting: 'Requesting the top-up…',
      paying: 'Adding funds…',
    },
    addingA11y: (amount: string) => `Adding ${amount}, please wait`,
    swipeA11y: (amount: string) => `Swipe to top up ${amount}`,
    swipeInvalidA11y: 'Swipe to top up, enter a valid amount first',
    processingTitle: (amount: string) => `Adding ${amount} to your wallet`,
    onlineBalance: (amount: string) => `Online balance: PHP ${amount}`,
    testNote:
      'This is a test top-up: the anchor adds PHPC to your online wallet and no real money is charged. Your first top-up takes a little longer while your wallet is set up to hold PHPC.',
    successTitle: 'Top-up complete',
    successBody: (amount: string) => `${amount} was added to your online wallet.`,
    failTitle: 'Top-up not completed',
  },

  receiveQr: {
    title: 'My QR Code',
    save: 'Save QR Card',
    saving: 'Saving…',
    withAmount: 'Generate QR with amount',
    caption: 'The sender scans this with the HoneBill scanner and your Short ID is filled in for them.',
    shareTitle: 'Save QR card',
    savedTitle: 'QR card saved',
    savedBody: 'Your QR card is now in your gallery.',
    permissionTitle: 'Permission needed',
    permissionBody: 'Allow access to your photos to save the QR card.',
    failTitle: 'Could not save',
    failBody: 'Something went wrong while saving the QR card. Please try again.',
  },
};

export type Messages = typeof en;
