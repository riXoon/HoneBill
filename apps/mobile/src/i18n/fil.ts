import type { Messages } from './en';

/**
 * Filipino text, in everyday Taglish: the way people already read GCash or Maya. Short action names (Send, Receive,
 * Top-up), product words (MPIN, QR, Short ID, Online/Offline Balance) and common loanwords (wallet, balance, account)
 * stay in English; explanations, warnings, errors and results are in Filipino.
 *
 * Draft wording: have a native speaker review it before release, starting with money and security text.
 */
export const fil: Messages = {
  common: {
    oneMoment: 'Sandali lang…',
    pleaseWait: 'Sandali lang…',
    done: 'Tapos na',
    ok: 'OK',
    tryAgain: 'Subukan ulit',
    dismiss: 'Isara',
    continue: 'Magpatuloy',
    cancel: 'Kanselahin',
    back: 'Bumalik',
    required: 'Kailangang lagyan ito',
    checking: 'Sinusuri…',
    copied: 'Nakopya!',
    gotIt: 'Sige',
    mascot: 'Si Honi, ang mascot ng HoneBill',
    noPhone: 'Walang mobile number ang account na ito sa device na ito.',
    tryLater: 'Pakisubukan ulit mamaya',
    invalidEmail: 'Maglagay ng tamang email address',
    sessionExpired: 'Nag-expire ang session',
    keepOpen: 'Huwag munang isara ang app. Puwedeng umabot ito ng isang minuto.',
    swipeToEnter: 'I-swipe para pumasok',
    confirmMpinTitle: 'Kumpirmahin gamit ang iyong MPIN',
    vaultUnavailable: 'Hindi available ang vault address',
    vaultCopied: 'Nakopya ang vault address',
    copyVault: 'Kopyahin ang vault address',
    notAvailableYet: 'Hindi pa available',
    hello: (name) => `Kumusta, ${name}!`,
    openDownloadFailed: 'Hindi mabuksan ang download',
  },

  onboarding: {
    phoneTitle: 'Ilagay ang iyong mobile number',
    phoneSignin: 'Ilagay ang mobile number na naka-link sa iyong HoneBill account',
    phoneSignup: 'I-link ang iyong mobile number para ma-set up ang iyong online at offline accounts',
    hasAccount: 'May account na ang numerong ito. Bumalik at mag-sign in.',
    mobileNumber: 'Mobile number',
    termsA11y: 'Terms and Conditions. Bubuksan ang terms para mabasa.',
    agreed: 'Sumang-ayon ka sa ',
    readAgree: 'Basahin at sumang-ayon sa ',
    readTerms: 'Basahin ang Terms para Magpatuloy',
    otpTitle: 'I-verify ang OTP',
    otpSent: (phone) => `Nagpadala kami ng verification code sa iyong mobile number: ${phone}`,
    otpA11y: 'One-time code',
    noOtp: 'Hindi natanggap ang OTP? ',
    sendingNew: 'Nagpapadala ng bagong code…',
    detailsTitle: 'Iyong Detalye',
    detailsSubtitle: 'Ilagay ang iyong detalye para makumpleto ang registration',
    tooLong: (max) => `Hanggang ${max} character lang`,
    firstName: 'Pangalan',
    lastName: 'Apelyido',
    firstNameExample: 'hal. Juan',
    lastNameExample: 'hal. Dela Cruz',
    verifyAgain: 'Pakiverify ulit ang iyong numero para makapagpatuloy.',
    walletFailed: 'Hindi namin magawa ang iyong secure na wallet sa device na ito. Pakisubukan ulit.',
    mpinTitle: 'I-secure ang Iyong Account',
    mpinSubtitle: 'Gumawa ng 4-digit PIN para protektahan ang iyong device',
    mpinA11y: 'Bagong 4-digit PIN',
    creatingVault: 'Ginagawa ang iyong vault…',
    confirmPin: 'Kumpirmahin ang 4-digit PIN',
    verifyAgainFinish: 'Pakiverify ulit ang iyong numero para matapos ang paggawa ng iyong account.',
    verificationExpired: 'Nag-expire ang verification',
    verifyPhoneAgain: 'Pakiverify ulit ang iyong mobile number.',
    detailsRejected: 'May ilang detalye na hindi tinanggap. Magsimula ulit at suriin ang iyong pangalan at email.',
    createFailed: 'Hindi namin magawa ang iyong account. Pakisubukan ulit.',
    securedTitle: 'Secured na ang Vault',
    securedSubtitle: 'Handa na ang iyong device para sa offline na transaksyon, kahit walang data.',
    creatingAccount: 'Ginagawa ang iyong account…',
    enter: 'Pumasok sa HoneBill',
    step: (n) => `Hakbang ${n} sa 4`,
  },

  pinDialog: {
    a11y: 'Ilagay ang iyong 4-digit MPIN',
  },

  keypad: {
    fingerprint: 'Mag-sign in gamit ang fingerprint',
    delete: 'Burahin',
  },

  profile: {
    logout: 'Mag-log out',
    addressCopied: 'Nakopya ang address!',
    version: (v) => `HoneBill version ${v}. Tingnan ang bago`,
    whatsNew: 'Ano ang bago',
    signOutTitle: 'Mag-sign out?',
    signOutBody: 'Kakailanganin mo ang iyong MPIN (o fingerprint) para makabalik.',
    signOut: 'Mag-sign out',
    stay: 'Manatiling naka-sign in',
  },

  accountSettings: {
    emailTaken: 'Ginagamit na ng ibang account ang email na ito.',
    resetHold: (wait) => `Para sa iyong seguridad, hindi mapapalitan ang iyong email sa loob ng ${wait} matapos ang MPIN reset.`,
    recentChange: (wait) => `Kakapalit mo lang ng email. Puwede mo itong palitan ulit pagkalipas ng ${wait}.`,
    notSaved: 'Hindi na-save ang iyong email',
    subtitle: 'Puwede mong i-update ang email ng iyong account.',
    notice:
      'Para sa iyong seguridad, magte-text kami ng code sa iyong numero para kumpirmahin, at isang beses lang kada 24 oras puwedeng palitan ang email.',
    newEmail: 'Bagong email address',
    name: 'Pangalan',
    notAvailable: 'Hindi available',
    cannotChange: 'Hindi mapapalitan dito ang iyong pangalan, numero at Short ID.',
    saved: 'Na-save! Updated na ang iyong email.',
    save: 'I-save ang email',
    saving: 'Sine-save ang iyong email…',
    pinMessage: 'Ilagay ang iyong 4-digit MPIN. Pagkatapos, magte-text kami ng code sa iyong numero.',
  },

  changeMpin: {
    currentSubtitle: 'Una, ilagay ang kasalukuyan mong 4-digit MPIN.',
    currentLabel: 'Kasalukuyang 4-digit MPIN',
    newSubtitle: 'Ngayon, pumili ng bagong 4-digit MPIN.',
    mustDiffer: 'Dapat iba ang bago mong MPIN sa kasalukuyan.',
    recent: (wait) => `Kakapalit mo lang ng MPIN. Puwede mo itong palitan ulit pagkalipas ng ${wait}.`,
    notChanged: 'Hindi napalitan ang iyong MPIN.',
    backToSettings: 'Bumalik sa settings',
    notice:
      'Para sa iyong seguridad, magte-text kami ng code sa iyong numero para kumpirmahin, at isang beses lang kada 24 oras puwedeng palitan ang MPIN. Magsa-sign in ka ulit gamit ang bagong MPIN.',
  },

  vault: {
    subtitle: 'Ang iyong wallet address, recovery phrase at offline payments.',
    noPhrase: 'Wala sa phone na ito ang recovery phrase ng account na ito.',
    readFailed: 'Hindi namin mabasa ang recovery phrase sa phone na ito.',
    biometricPrompt: 'Ipakita ang iyong recovery phrase',
    copyAddress: 'Kopyahin ang address',
    warning: 'Makukuha ng sinumang may 12 salitang ito ang iyong pera. Huwag itong ibahagi. Kusa itong magtatago pagkalipas ng isang minuto.',
    hide: 'Itago',
    explain:
      'Ibinabalik ng 12 salitang ito ang iyong wallet sa bagong phone. Hihingin namin ang iyong fingerprint o MPIN bago ito ipakita.',
    show: 'Ipakita ang recovery phrase',
    ready: 'Handang magbayad kahit walang internet',
    notSetUp: 'Hindi pa naka-set up sa phone na ito',
    setUpHint: 'I-set up ito nang isang beses habang online, para makapag-send ka kahit walang internet.',
    connectToSetUp: 'Kumonekta sa internet para ma-set up ito.',
    settingUp: 'Sine-set up…',
    setUpNow: 'I-set up ngayon',
    pinMessage: 'Ilagay ang iyong 4-digit MPIN para makita ang iyong recovery phrase.',
  },

  comingSoon: {
    body: (feature) => `Hindi pa available ang ${feature} sa ngayon. Inaayos pa namin ito, kaya pakibalikan ulit.`,
    meantime: 'Pansamantala, puwede kang mag-send gamit ang HoneBill.',
  },

  update: {
    title: 'I-update ang HoneBill para makapagpatuloy',
    unsupported: (current, minimum) =>
      `Hindi na suportado ang version na ito (${current}). I-install ang version ${minimum} o mas bago para patuloy na magamit ang iyong wallet.`,
    safe: 'Ligtas ang iyong pera. I-install ang bagong version sa ibabaw nito at mananatili ang iyong wallet sa phone na ito.',
    askSupport: 'Humingi sa HoneBill support ng download link ng pinakabagong version.',
    download: 'I-download ang update',
    checkAgain: 'Suriin ulit',
  },

  inbox: {
    subtitle: 'Tingnan dito ang iyong mga update',
    latest: 'Pinakabago',
    empty: 'Wala pang makikita rito!\nDito lalabas ang iyong mga update.',
    unread: 'Hindi pa nababasa. ',
    updateAvailable: 'May bagong update',
    askSupport: 'Humingi sa HoneBill support ng download link ng bagong version.',
  },

  feedback: {
    categories: {
      payment: { label: 'Problema sa payment', placeholder: 'hal. Nag-send ako ng ₱500 sa SMS kahapon pero hindi pa dumarating.' },
      account: { label: 'Account o sign-in', placeholder: 'hal. Hindi tinatanggap ang MPIN ko matapos ko itong palitan.' },
      bug: { label: 'May hindi gumagana', placeholder: 'Sabihin kung ano ang ginagawa mo at ano ang nangyari.' },
      suggestion: { label: 'Mungkahi', placeholder: 'Ano ang makakapagpaganda ng HoneBill para sa iyo?' },
    },
    moreDetail: 'Pakikuwento pa nang kaunti.',
    saveFailed: 'Hindi ma-save ang iyong report. Pakisubukan ulit kapag online ka na.',
    sentTitle: 'Salamat! Naipadala na ang iyong report.',
    sentBody:
      'Binabasa ng aming team ang bawat report. Hindi pa kami makakasagot sa app, pero nakakatulong ang iyong report para mas mabilis naming maayos ang mga problema.',
    queuedTitle: 'Na-save. Ipapadala namin ito pagbalik mo online.',
    queuedBody: 'Nakatago ang iyong report sa phone na ito at kusang maipapadala sa susunod na may internet ka.',
    subtitle: 'Sabihin sa amin ang problema o ideya mo. Binabasa namin ang bawat report.',
    txA11y: 'Ang payment na tinutukoy ng report na ito',
    aboutPayment: 'Tungkol sa payment na ito',
    whatAbout: 'Tungkol saan ito?',
    yourMessage: 'Ang iyong mensahe',
    offline: 'Offline ka. Mase-save ang iyong report at maipapadala pagbalik mo online.',
    privacy:
      'Isasama namin ang iyong Short ID, app version at uri ng phone para masuri namin ito. Huwag kailanman ibahagi ang iyong MPIN o recovery phrase, kahit sa amin.',
    sending: 'Sine-send…',
    send: 'I-send ang report',
  },

  qrScan: {
    notHoneBillTitle: 'Hindi ito HoneBill code',
    notHoneBillBody: 'Hindi HoneBill payment code ang QR code na ito.',
    ownTitle: 'Sarili mong code',
    ownBody: 'Hindi ka puwedeng mag-send ng pera sa sarili mo.',
    offlineTitle: 'Offline ka',
    offlineBody: 'Lumipat sa "Send via offline" para mabayaran ang code na ito gamit ang SMS.',
    noAccountTitle: 'Walang account na nahanap',
    noAccountBody: 'Wala kaming mahanap na account para sa QR code na ito.',
    checkFailed: 'Hindi ma-check ang code',
    noQrTitle: 'Walang QR code na nahanap',
    noQrBody: 'Walang QR code sa larawang iyan. Pumili ng malinaw at buong QR card.',
    readFailedTitle: 'Hindi mabasa ang larawan',
    readFailedBody: 'Nagkaproblema sa pagbasa ng QR code. Pakisubukan ulit.',
    title: 'I-scan ang QR Code',
    modeA11y: (mode, other) => `Nagse-send ${mode}. I-tap para lumipat sa ${other}`,
    checking: 'Sinusuri ang code…',
    cameraOff: 'Naka-off ang access sa camera. I-tap para buksan ang Settings.',
    point: 'Itapat ang camera sa QR code, o mag-upload ng naka-save na QR.',
    uploadA11y: 'Mag-upload ng QR mula sa gallery',
    reading: 'Binabasa…',
    relayFailedTitle: 'Hindi mabuksan ang messages',
    relayFailedBody: 'Walang mabuksang messaging app, kaya hindi na-send ang payment. Pakisubukan ulit.',
    relayNoGatewayBody: 'Walang naka-set na payment number sa phone na ito, kaya hindi ma-send ang payment mula rito.',
  },

  txDetail: {
    sentBySms: 'Na-send sa SMS, hinihintay ang kumpirmasyon',
    stillNotConfirmed:
      'Hindi pa rin nakukumpirma. Kumonekta sa internet para malaman, o hanapin ang text mula sa HoneBill na may ganitong reference.',
    willText: (ref) => `Makakatanggap ka ng text mula sa HoneBill na may Ref ${ref} kapag natuloy o hindi ito natuloy.`,
    couldNotConfirm: 'Hindi makumpirma',
    didNotGoThrough: 'Hindi natuloy ang payment na ito',
    stillWaiting: 'Naghihintay pa rin',
    waiting: 'Hinihintay ang kumpirmasyon',
    received: 'Natanggap',
    sent: 'Na-send',
    shareMessage: (direction, amount, description, status, ref, when) =>
      `Resibo ng HoneBill\n${direction} ${amount}\n${description}\nStatus: ${status}\nRef No. ${ref}\n${when}`,
    report: 'Mag-report ng problema',
    type: 'Uri',
    source: 'Pinagmulan',
    description: 'Deskripsyon',
    amount: 'Halaga',
  },

  history: {
    subtitle: 'Tingnan dito ang iyong\ntransaction history',
    savedNote: (online, when) => `${online ? 'Hindi ma-refresh.' : 'Offline ka.'} Ipinapakita ang huling update, ${when}.`,
    empty: 'Wala pang makikita rito!\nGawin ang una mong transaksyon!',
  },

  receive: {
    title: 'Mag-request ng Halaga',
    amountLabel: 'Halagang matatanggap (PHPC)',
  },

  qrCard: {
    a11y: (name) => `HoneBill QR card ni ${name}`,
    a11yAmount: (name, amount) => `HoneBill QR card ni ${name}, humihingi ng ${amount}`,
    user: 'HoneBill user',
    scanWith: 'I-scan gamit ang HoneBill app',
    pay: 'BAYARAN',
    sendTo: 'MAG-SEND NG PERA KAY',
  },

  shortId: {
    copiedAnnounce: 'Nakopya ang Short ID',
    hint: 'Kinokopya ang Short ID',
  },

  balance: {
    chip: { idle: 'Nilo-load', loading: 'Ina-update', ready: 'Synced', error: 'Hindi updated' },
    show: 'Ipakita ang balance',
    hide: 'Itago ang balance',
    hidden: 'Nakatago ang balance',
    loading: 'Nilo-load ang balance',
    switchA11y: (mode, other) => `Ipinapakita ang ${mode} balance. I-tap para lumipat sa ${other} balance`,
  },

  quickActions: {
    toOffline: 'Ilipat sa Offline Balance',
    toOnline: 'Ilipat sa Online Balance',
  },

  nav: {
    scanA11y: 'I-scan ang QR code',
  },

  loading: {
    lines: ['Kinukuha ang iyong honey…', 'Lumilipad papunta sa server…', 'Binibilang ang iyong barya…', 'Pinapakintab ang honeycomb…', 'Malapit na, sandali lang!'],
  },

  crash: {
    title: 'Nagkaproblema',
    body: 'Nagkaroon ng hindi inaasahang problema ang HoneBill. Ligtas sa device na ito ang iyong wallet at mga offline payment.',
  },

  language: {
    title: 'Wika',
    hint: 'Piliin ang wika ng app. Hindi nagbabago ang mga salitang gaya ng Send, MPIN at QR.',
  },

  time: {
    minutes: (n) => `${n} minuto`,
    hours: (n) => `${n} oras`,
    justNow: 'ngayon lang',
    minutesAgo: (n) => `${n} min ang nakalipas`,
    hoursAgo: (n) => `${n} oras ang nakalipas`,
    daysAgo: (n) => `${n} araw ang nakalipas`,
  },

  pin: {
    wrong: (left) => `Mali ang MPIN. ${left} subok na lang ang natitira.`,
    locked: (wait) => `Masyadong maraming maling subok. Subukan ulit pagkalipas ng ${wait}.`,
  },

  login: {
    enterMpin: 'Ilagay ang iyong MPIN',
    mpinChanged: 'Napalitan na ang MPIN. Ilagay ang bago mong MPIN',
    locked: 'Naka-lock para sa iyong seguridad. Ilagay ang iyong MPIN',
    signingIn: 'Nagsa-sign in…',
    enterNumber: 'Ilagay ang iyong numero',
    enterPhoneA11y: 'Ilagay ang iyong mobile number',
    signingInAs: (phone) => `Nagsa-sign in bilang ${phone}. Gumamit ng ibang numero`,
    forgot: 'Nakalimutan ang MPIN?',
    forgotA11y: 'Nakalimutan ang MPIN? I-reset ito',
    overlayTitle: 'Sina-sign in ka',
    stepPin: 'Sinusuri ang iyong MPIN…',
    stepAccount: 'Binubuksan ang iyong account…',
    stepWallet: 'Sinusuri ang iyong wallet…',
    noWallet: 'Wala pa sa phone na ito ang iyong wallet. Kumonekta sa internet para maibalik ito.',
    offlineNotSetUp: 'Offline ka. Para magamit ang MPIN kahit offline, mag-sign in muna gamit ito habang online.',
    offlineNotSetUpFingerprint:
      'Offline ka. Para magamit ang MPIN kahit offline, mag-sign in muna gamit ito habang online. Sa ngayon, gamitin ang iyong fingerprint.',
    noMpinForNumber: 'Walang MPIN para sa numerong ito. I-tap ang numero para gumamit ng iba.',
    noAccount: 'Walang account para sa numerong ito.',
  },

  weakPin: {
    title: 'Hindi puwede ang PIN na ito',
    repeated: 'Ang apat na parehong numero, gaya ng 1111 o 2222, ang isa sa mga unang sinusubukan ng iba.',
    sequence: 'Ang magkakasunod na numero, gaya ng 1234 o 4321, ay karaniwang PIN at madaling hulaan.',
    common: 'Isa ito sa mga pinakakaraniwang PIN, kaya madali itong hulaan.',
    advice: 'Para sa iyong seguridad, gumawa ng ibang PIN na mahirap hulaan at ikaw lang ang nakakaalam.',
    button: 'Gumawa ng ibang PIN',
  },

  smsCode: {
    sendingTo: 'Nagpapadala ng code sa ',
    sentTo: 'Nag-text kami ng 6-digit code sa ',
    codeA11y: 'SMS verification code',
    enterCode: (length) => `Ilagay ang ${length}-digit code.`,
    wrongCode: (left) => `Mali ang code. ${left} subok na lang ang natitira.`,
    checking: 'Sinusuri…',
    didntGetIt: 'Hindi natanggap? ',
    resend: 'Ipadala ulit',
    sending: 'Nagpapadala…',
    resendIn: (seconds) => `Ipadala ulit pagkalipas ng ${seconds}s`,
    verify: 'I-verify',
  },

  forgotMpin: {
    title: 'Nakalimutan ang MPIN',
    newSubtitle: 'Pumili ng bagong 4-digit MPIN.',
    newLabel: 'Bagong 4-digit MPIN',
    confirmSubtitle: 'Ilagay ulit ang bagong MPIN para kumpirmahin.',
    confirmLabel: 'Kumpirmahin ang bagong 4-digit MPIN',
    offline: 'Offline ka. Kumonekta sa internet para ma-reset ang iyong MPIN.',
    noAccount: 'Walang account para sa numerong ito.',
    codeExpired: 'Nag-expire na ang iyong code. Nagpadala kami ng bago.',
    mismatch: 'Hindi nagtugma ang dalawang MPIN. Pumili ulit ng bagong MPIN.',
    saving: 'Nire-reset ang iyong MPIN',
    checkingSubtitle: 'Sinusuri ang iyong account…',
    blockedSubtitle: 'Hindi na-reset ang iyong MPIN.',
    blockedTitle: 'Hindi kami makapagpatuloy',
    backToSignIn: 'Bumalik sa sign in',
    noWalletSubtitle: 'Wala pa sa phone na ito ang iyong wallet.',
    noWalletTitle: 'Ibalik muna ang iyong wallet',
    noWalletBody:
      'Para manatiling ligtas ang iyong pera, mare-reset lang ang MPIN mula sa phone na may hawak ng iyong wallet. Ibalik ito gamit ang iyong 12-word recovery phrase, saka i-tap ulit ang "Nakalimutan ang MPIN?".',
    restoreWallet: 'Ibalik ang aking wallet',
    smsSubtitle: 'Kumpirmahin na ikaw ito gamit ang code na ite-text namin sa iyong numero.',
    emailHold:
      'Gagamitin mo ang bagong MPIN na ito sa pag-sign in. Para sa iyong seguridad, hindi mapapalitan ang iyong email sa loob ng 24 oras matapos ang MPIN reset.',
  },

  landing: {
    createAccount: 'Gumawa ng account',
  },

  home: {
    hello: (name) => `Kumusta, ${name}`,
    online: 'Online ka',
    offline: 'Offline ka',
    availableToSend: (amount) => `${amount} ang puwedeng i-send`,
    held: (amount) => `Naka-hold ang ${amount} para sa mga offline payment na hinihintay pang ma-settle.`,
    balanceAsOf: (when) => `Huling update ng balance: ${when}`,
    refreshFailed: 'Hindi ma-refresh. Hilahin pababa para subukan ulit.',
  },

  connectivity: {
    offlineTitle: 'Offline ka',
    offlineLines: [
      'Hindi magagamit ang mga online feature, gaya ng iyong Online Balance at paglilipat ng pera sa pagitan ng iyong mga balance, hanggang bumalik ang internet.',
      'Puwede ka pa ring magbayad at tumanggap gamit ang iyong Offline Balance.',
    ],
    restoredTitle: 'Online ka na ulit',
    restoredLines: [
      'Magagamit na ulit ang mga online feature, at ina-update na ang iyong mga balance at transaksyon.',
      'I-tap ang iyong balance cards para lumipat sa iyong Online Balance.',
    ],
    gotIt: 'Sige',
  },

  outcomes: {
    settled: (n) => `Natuloy ang ${n} offline payment.`,
    failed: (n) => `Hindi natuloy ang ${n} offline payment. Walang perang nabawas.`,
    unconfirmed: (n) => `Hindi makumpirma ang ${n} offline payment. Tingnan muna ang iyong balance bago mag-send ulit.`,
    failedTitle: (n) => (n === 1 ? 'May payment na hindi natuloy' : 'May mga payment na hindi natuloy'),
    checkTitle: (n) => (n === 1 ? 'May payment na kailangang tingnan' : 'May mga payment na kailangang tingnan'),
    updatedTitle: 'Na-update ang mga offline payment',
    view: 'Tingnan',
    viewA11y: 'Tingnan sa History',
  },

  tx: {
    noMoneyTaken: 'Walang perang nabawas.',
    expired:
      'Hindi ito nakumpirma sa loob ng 14 araw, kaya hindi na ito susubukan ulit. Tingnan muna ang iyong balance bago ito i-send ulit.',
    reasons: {
      noAccount: 'Walang account na may ganitong ID.',
      notVerified: 'Hindi ma-verify ang payment.',
      notSetUp: 'Hindi naka-set up ang phone na ito para sa offline payments.',
      currency: 'Hindi tinatanggap ang currency na ito sa ngayon.',
      senderMissing: 'Hindi makita ang iyong account.',
      notAccepted: 'Hindi tinanggap ang payment.',
    },
  },

  send: {
    sendTo: 'I-send sa',
    self: 'Hindi ka puwedeng mag-send sa sarili mo.',
    noInternetCheck: 'Walang internet, kaya hindi ma-check ang ID na ito. Kumonekta, o mag-send offline na lang.',
    noAccountForId: 'Walang account na may ganitong ID.',
    recipientIdA11y: 'Short ID ng padadalhan',
    checkingId: 'Sinusuri ang ID…',
    uncheckedTitle: 'Suriin muna ang ID bago magpatuloy',
    continueWith: (id) => `Ituloy gamit ang ${id}`,
    uncheckedBody: (id) =>
      `Offline ka, kaya hindi namin makumpirma ang ID na ${id}. Ipakumpirma ito sa padadalhan. Kadalasang hindi natutuloy ang payment kapag mali ang ID.`,
    methods: 'Mga paraan',
    noRecents: 'Wala ka pang recent na padadalhan.',
    noFavorites: 'Wala pang favorites. I-tap ang star para magdagdag.',
    swipe: 'I-SWIPE PARA ITULOY',
    swipeA11y: (amount) => `I-swipe para ituloy ang ${amount}`,
    swipeInvalidA11y: 'I-swipe para ituloy. Maglagay muna ng tamang halaga.',
    addFavorite: (name) => `Idagdag si ${name} sa favorites`,
    removeFavorite: (name) => `Alisin si ${name} sa favorites`,
    balanceAfter: (amount) => `Balance pagkatapos: ${amount}`,
    available: (amount) => `Puwedeng gamitin: PHP ${amount}`,
    noteLabel: 'Note (Opsyonal)',
    noteA11y: 'Note, opsyonal',
    notePlaceholder: 'hal. Tanghalian, upa, pasalubong',
  },

  sendMethod: {
    title: 'Paraan',
    question: 'Paano mo ito gustong i-send?',
    smsTitle: 'I-send gamit ang phone ko',
    smsBody: 'May regular na singil sa SMS. Kailangan ng active na text promo.',
    relayTitle: 'Magpatulong sa pag-send',
    relayBody: 'Walang load? Ipakita ang iyong screen sa isang partner para ma-scan nila ito at sila ang mag-text para sa iyo.',
    prepareFailedTitle: 'Hindi maihanda ang payment',
    noMessagingApp: 'Walang mabuksang messaging app. Walang perang nailipat.',
    relayQrTitle: 'Ipa-scan ito sa partner mo',
    relayQrBody:
      'I-scan ito ng partner mo gamit ang HoneBill o ang camera ng phone niya, tapos i-tap niya ang Send sa text na magbubukas. Load niya ang gagamitin, at hindi niya mababago ang halaga o kung sino ang tatanggap.',
    relayQrA11y: 'Payment QR code na ipa-scan sa partner mo',
    relayTo: (name) => `para kay ${name}`,
    relayDone: 'Na-send na ng partner ko',
    relayCancel: 'Isara',
    relayFailed: 'Nagkaproblema sa paghahanda ng QR code. Walang perang nailipat.',
    sentTitle: 'Na-send mo na ba ang text?',
    sentBody: 'Matutuloy lang ang payment kapag na-send na ang text message.',
    sentYes: 'Oo, na-send ko na',
    sentNo: 'Hindi pa',
  },

  verify: {
    title: 'Pag-verify',
    noInternetTitle: 'Walang internet',
    noInternetBody:
      'Kailangan ng internet para sa online payment. Lumipat sa Offline view sa Home para magbayad gamit ang voucher.',
    notSentTitle: 'Hindi na-send ang payment',
    swipe: 'I-SWIPE PARA I-AUTHORIZE',
    sending: 'SINE-SEND…',
    processing: (amount, name) => `Sine-send ang ${amount} kay ${name}`,
    sendingA11y: 'Sine-send, sandali lang',
    notEnoughA11y: 'I-swipe para i-authorize. Kulang ang balance.',
    swipeA11y: 'I-swipe para i-authorize',
    confirmFirstA11y: 'I-swipe para i-authorize. Kumpirmahin muna ang mga detalye.',
    totalLabel: 'KABUUANG HALAGA',
    totalA11y: (amount) => `Kabuuang halaga ${amount}`,
    notEnough: (wallet) => `Kulang ang ${wallet} balance. Bumalik at babaan ang halaga.`,
    recipientCaption: 'ACCOUNT NG PADADALHAN',
    senderCaption: 'ACCOUNT NG NAGPADALA',
    uncheckedTitle: 'Hindi pa nasusuri ang ID',
    uncheckedBody: 'Offline ka, kaya hindi makumpirma ang ID na ito. Siguraduhing tama ito bago mag-authorize.',
    myWallet: 'Aking Wallet',
    myVault: 'Aking Vault Wallet',
    defaultMemo: 'Offline na transaksyon',
    amountSent: 'Halagang ipinadala',
    totalDeducted: 'Kabuuang ibabawas',
    confirm: 'Kinukumpirma kong tama ang mga detalye ng padadalhan at ang halaga.',
  },

  receipt: {
    title: 'Na-send',
    returnHome: 'Bumalik sa Home',
    heading: 'Nagawa na ang resibo',
    bySms: (ref) =>
      `Na-send ang iyong payment sa pamamagitan ng SMS.\nMakakatanggap ka ng text na may Ref ${ref} kapag natuloy o hindi ito natuloy.`,
    online: 'Matagumpay ang iyong transaksyon.\nIpinadala gamit ang HoneBill',
    recipient: 'Pinadalhan',
    amountSent: 'Halagang ipinadala',
    share: 'I-share ang resibo',
    shareUnavailableTitle: 'Hindi puwedeng mag-share',
    shareUnavailableBody: 'Hindi kayang mag-share ng files ang phone na ito mula sa app.',
    shareFailedTitle: 'Hindi ma-share',
    shareFailedBody: 'Nagkaproblema sa paghahanda ng resibo. Pakisubukan ulit.',
  },

  errors: {
    generic: 'Nagkaproblema. Pakisubukan ulit.',
    timeout: 'Masyadong natagalan ang server. Pakisubukan ulit.',
    network: 'Hindi maabot ang server. Suriin ang iyong koneksyon at subukan ulit.',
    requestFailed: (status) => `Hindi natuloy ang request (${status}).`,
  },

  biometric: {
    prompt: 'Mag-sign in sa HoneBill',
    useMpin: 'Gamitin ang MPIN',
  },

  whatsNew: {
    onVersion: (version) => `Gumagamit ka ng HoneBill ${version}.`,
  },

  terms: {
    readAccepting: (minutes) => `Mga ${minutes} minutong babasahin. Self-custody wallet ang HoneBill, kaya pakibasa ang lahat.`,
    read: (minutes) => `Mga ${minutes} minutong babasahin.`,
    scrollHint: (section, total) => `Mag-scroll hanggang dulo para magpatuloy · Bahagi ${section} sa ${total}`,
    tickHint: 'I-tick ang kahon sa itaas para magpatuloy',
    // The full terms stay in English (the binding version), so the Filipino note says so.
    highlights: 'Mga highlight lang ito. Ang buong terms sa ibaba (nasa English) ang sinasang-ayunan mo.',
    agree: 'Sumasang-ayon Ako',
  },

  recovery: {
    neverShare: 'Huwag kailanman ibahagi ang mga salitang ito kahit kanino.',
    readFailed: 'Hindi namin mabasa ang iyong recovery phrase sa device na ito.',
    subtitle: 'Kopyahin at i-save ang 12 salitang ito sa ligtas na lugar.',
    copied: 'Nakopya',
    copy: 'Kopyahin',
    copyA11y: 'Kopyahin ang phrase',
    copiedAnnounce: 'Nakopya ang recovery phrase. Mabubura ito sa clipboard pagkalipas ng 60 segundo.',
    wordA11y: (n, word) => `Salita ${n}, ${word}`,
    loading: 'Nilo-load ang iyong phrase…',
    reminderTitle: 'Paalala sa Seguridad',
    reminderBody:
      'Huwag kailanman ibahagi ang mga salitang ito kahit kanino. Itago ang mga ito sa ligtas at offline na lugar, gaya ng safe o secure na note-taking app.',
    saved: 'Na-save ko na',
    dialogTitle: 'Protektahan ang iyong recovery phrase',
    dialogWhy:
      'Ang 12 salitang ito lang ang paraan para mabawi ang iyong account kapag nag-log in ka sa ibang device o nawala ang phone na ito.',
    dialogKeep:
      'Isulat ang mga ito at itago sa ligtas na lugar. Huwag kailanman ibahagi kahit kanino: hindi ito mababawi ng HoneBill para sa iyo. Hihilingin sa iyong kumpirmahin ang mga ito sa susunod.',
    understand: (secondsLeft) => (secondsLeft > 0 ? `Naiintindihan ko (${secondsLeft})` : 'Naiintindihan ko'),
    verifyTitle: 'I-verify ang Seed Phrase',
    verifyIntro:
      'Wala pa sa phone na ito ang iyong wallet. Ilagay ang 12-word recovery phrase na na-save mo noong ginawa mo ang iyong account. I-paste ang lahat ng 12 salita nang sabay-sabay. Huwag kailanman ibahagi ang mga salitang ito kahit kanino.',
    clipboardFailed: 'Hindi mabasa ang clipboard. I-paste na lang nang mano-mano sa kahon.',
    wordCount: (need, have) => `Ilagay ang lahat ng ${need} salita. ${have} pa lang ang nailagay mo.`,
    invalid: 'Hindi valid na recovery phrase ang mga salitang ito. Suriin ang spelling at pagkakasunod-sunod.',
    notThisAccount: 'Hindi para sa account na ito ang recovery phrase na ito.',
    phraseA11y: 'Recovery phrase',
    pastePlaceholder: 'I-paste dito ang iyong 12 salita',
    paste: 'I-paste mula sa clipboard',
    restoring: 'Ibinabalik…',
    restore: 'Ibalik ang wallet',
    quizTitle: 'Kumpirmahin ang Seed Phrase',
    quizIntroAt: (position) =>
      `Ilagay ang salita sa posisyon #${position} para i-verify ang iyong recovery phrase. Huwag kailanman ibahagi ang mga salitang ito kahit kanino.`,
    quizIntro:
      'Maglagay ng salita mula sa iyong recovery phrase para i-verify ito. Huwag kailanman ibahagi ang mga salitang ito kahit kanino.',
    question: (position) => `Ano ang ika-${position} mong salita?`,
    wordLabel: (position) => `Salita #${position}`,
    wordInputA11y: (position) => `Salita bilang ${position}`,
    wordPlaceholder: 'Ilagay ang salita',
    required: 'Kailangang lagyan ito',
    wrongWord: 'Mali ang salitang iyan. Tingnan ang iyong nakasulat na kopya at subukan ulit sa mga bagong tanong.',
    progressA11y: (current, total) => `Tanong ${current} sa ${total}`,
    verify: 'I-verify',
    preparing: 'Inihahanda ang iyong mga tanong…',
  },

  amount: {
    unavailable: 'Hindi makuha ang balance',
    enter: 'Maglagay ng halaga',
    notEnough: 'Kulang ang balance',
    inPesos: 'Halaga sa piso',
  },

  transfer: {
    swipe: 'I-SWIPE PARA ITULOY',
    transferring: 'INILILIPAT…',
    transferringA11y: (amount) => `Inililipat ang ${amount}, sandali lang`,
    swipeA11y: (amount) => `I-swipe para ilipat ang ${amount}`,
    swipeInvalidA11y: 'I-swipe para ituloy. Maglagay muna ng tamang halaga.',
    movingToOffline: (amount) => `Inililipat ang ${amount} sa iyong offline vault`,
    movingToOnline: (amount) => `Inililipat ang ${amount} sa iyong online wallet`,
    balanceAfter: (wallet, amount) => `${wallet} Balance pagkatapos: ${amount}`,
    available: (wallet, amount) => `Puwedeng gamitin sa ${wallet}: PHP ${amount}`,
    fromNote: (wallet) => `Maglilipat ka ng pera mula sa iyong ${wallet} wallet`,
    successTitle: 'Tapos na ang transfer',
    successBody: (amount, wallet) => `Nasa iyong ${wallet} wallet na ang ${amount}.`,
    failTitle: 'Hindi natuloy ang transfer',
  },

  topUp: {
    swipe: 'I-SWIPE PARA MAG-TOP UP',
    stepLabel: {
      preparing: 'NAGHAHANDA…',
      wallet: 'INI-SET UP ANG WALLET…',
      requesting: 'HINIHILING ANG TOP-UP…',
      paying: 'IDINADAGDAG ANG PERA…',
    },
    stepText: {
      preparing: 'Naghahanda…',
      wallet: 'Ini-set up ang iyong wallet…',
      requesting: 'Hinihiling ang top-up…',
      paying: 'Idinadagdag ang pera…',
    },
    addingA11y: (amount) => `Idinadagdag ang ${amount}, sandali lang`,
    swipeA11y: (amount) => `I-swipe para mag-top up ng ${amount}`,
    swipeInvalidA11y: 'I-swipe para mag-top up. Maglagay muna ng tamang halaga.',
    processingTitle: (amount) => `Idinadagdag ang ${amount} sa iyong wallet`,
    onlineBalance: (amount) => `Online Balance: PHP ${amount}`,
    testNote:
      'Test top-up lang ito: ang anchor ang magdadagdag ng PHPC sa iyong online wallet at walang totoong perang sisingilin. Medyo matagal ang una mong top-up habang ini-set up ang iyong wallet para sa PHPC.',
    successTitle: 'Tapos na ang top-up',
    successBody: (amount) => `Naidagdag ang ${amount} sa iyong online wallet.`,
    failTitle: 'Hindi natuloy ang top-up',
  },

  receiveQr: {
    title: 'Aking QR Code',
    save: 'I-save ang QR Card',
    saving: 'Sine-save…',
    withAmount: 'Gumawa ng QR na may halaga',
    caption: 'I-scan ito ng magpapadala gamit ang HoneBill scanner, at kusang malalagay ang iyong Short ID.',
    shareTitle: 'I-save ang QR card',
    savedTitle: 'Na-save ang QR card',
    savedBody: 'Nasa iyong gallery na ang QR card mo.',
    permissionTitle: 'Kailangan ng pahintulot',
    permissionBody: 'Payagan ang access sa iyong photos para ma-save ang QR card.',
    failTitle: 'Hindi na-save',
    failBody: 'Nagkaproblema sa pag-save ng QR card. Pakisubukan ulit.',
  },
};
