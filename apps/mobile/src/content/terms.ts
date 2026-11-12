/** Version of the text below. Bump it whenever the terms change so acceptance can be re-requested. */
export const TERMS_VERSION = '1.0';

export type TermsClause = {
  /** Clause number as printed ("2.1"); omitted for the unnumbered opening paragraphs. */
  ref?: string;
  /** Bold lead-in ("Self-Custody of Funds"). */
  heading?: string;
  body?: string;
  /** Bulleted sub-items (clause 5.2). */
  items?: { heading: string; body: string }[];
};

export type TermsSection = { id: number; title: string; clauses: TermsClause[] };

/** The four points that matter most, shown as plain-language cards above the full text. */
export const TERMS_KEY_POINTS = [
  {
    key: 'custody',
    title: 'You alone hold your keys',
    body: 'HoneBill never stores your Recovery Phrase. Lose it and your wallet and funds are gone for good.',
    clause: '4.2 – 4.3',
  },
  {
    key: 'irreversible',
    title: 'Transfers cannot be undone',
    body: 'Once a payment settles on the Stellar network it is final. We cannot reverse or refund a wrong recipient.',
    clause: '7.2',
  },
  {
    key: 'sms',
    title: 'SMS rates are on you',
    body: 'Sending offline payments by SMS uses your own load or carrier rates.',
    clause: '5.2',
  },
  {
    key: 'p2p',
    title: 'Person-to-person only',
    body: 'HoneBill is for P2P transfers. No merchant checkout, bill payments or bank links.',
    clause: '2.1',
  },
] as const;

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: 1,
    title: 'Acceptance of Terms',
    clauses: [
      {
        body: 'By downloading, registering for, or using the HoneBill mobile application and its associated services (collectively, the "System"), you ("User") agree to be bound by these Terms and Conditions. If you do not agree to all of these terms, do not access or use the System.',
      },
      {
        body: 'HoneBill is a peer-to-peer (P2P) offline-first digital wallet application built on the Stellar Blockchain Network and Soroban Smart Contracts, designed to facilitate secure P2P transfers using GSM/SMS and QR-assisted zero-data transport layers.',
      },
    ],
  },
  {
    id: 2,
    title: 'Nature of Service & Capstone Scope',
    clauses: [
      {
        ref: '2.1',
        heading: 'Peer-to-Peer Scope Only',
        body: 'HoneBill strictly processes the sending and receiving of digital funds via Peer-to-Peer (P2P) transactions. The System does not support merchant checkout systems, automated bill payments, non-P2P financial activities, or direct banking integrations.',
      },
      {
        ref: '2.2',
        heading: 'Academic & Developmental Origin',
        body: 'HoneBill was developed as a Capstone Project at Quezon City University (College of Computer Studies). While engineered with cryptographic and security standards aligned with ISO/IEC 25010, users acknowledge the operational scope and limitations of the platform.',
      },
    ],
  },
  {
    id: 3,
    title: 'Eligibility and Identity Verification (KYC)',
    clauses: [
      {
        ref: '3.1',
        heading: 'Regulatory Compliance',
        body: 'To comply with regulatory standards and Bangko Sentral ng Pilipinas (BSP) guidelines for digital financial platforms, Users must complete a Know Your Customer (KYC) onboarding process during account registration and fiat on-ramping.',
      },
      {
        ref: '3.2',
        heading: 'Accurate Information',
        body: 'You agree to provide accurate, current, and complete information during registration, including a valid mobile phone number and registered SIM card.',
      },
      {
        ref: '3.3',
        heading: 'Device & Connectivity Compatibility',
        body: 'Users are responsible for maintaining a compatible mobile device capable of running the HoneBill application and accessing 2G/GSM cellular networks for SMS transmission or using the device camera for QR code scanning.',
      },
    ],
  },
  {
    id: 4,
    title: 'Non-Custodial Wallet & Recovery Phrase Responsibility',
    clauses: [
      {
        ref: '4.1',
        heading: 'Self-Custody of Funds',
        body: 'HoneBill operates on a non-custodial architecture. You retain sole control over your cryptographic keys and wallet balances.',
      },
      {
        ref: '4.2',
        heading: 'Irrecoverability of Seed / Recovery Phrases',
        body: 'Upon wallet creation, you will be issued a Secret Recovery Phrase (Seed Phrase). Because HoneBill utilizes decentralized blockchain technology, HoneBill administrators, developers, and servers do NOT store, have access to, or have the ability to reset your Recovery Phrase.',
      },
      {
        ref: '4.3',
        heading: 'Sole Liability for Loss',
        body: 'If you lose, misplace, or forget your Recovery Phrase, your wallet and all associated funds will be permanently and irreversibly inaccessible. HoneBill assumes zero liability for lost funds resulting from forgotten seed phrases, compromised credentials, or unauthorized device access.',
      },
      {
        ref: '4.4',
        heading: 'Digital Signature Authorization',
        body: 'Any transaction locally prepared and signed using your Ed25519 cryptographic key is deemed legally authorized by you.',
      },
    ],
  },
  {
    id: 5,
    title: 'Offline Transactions, SMS Bridging, and QR Relaying',
    clauses: [
      {
        ref: '5.1',
        heading: 'Local Preparation & Storage',
        body: 'HoneBill utilizes an offline-first architecture that allows you to prepare, cryptographically sign (via Ed25519), and store transaction records locally on your device without an active internet connection.',
      },
      {
        ref: '5.2',
        heading: 'Transmission Channels',
        items: [
          {
            heading: 'Direct SMS Transport',
            body: 'Compressed, Base62-encoded signed payloads may be transmitted via standard GSM/SMS to the HoneBill Zero-API Gateway. Standard telecommunications carrier SMS rates or prepaid load deductions apply and are borne solely by the User.',
          },
          {
            heading: 'Dynamic Payload QR Relay',
            body: 'Users without active mobile data or SMS credits may generate a Dynamic Payload QR Code containing their signed transaction to be scanned and relayed by a nearby third-party device.',
          },
        ],
      },
      {
        ref: '5.3',
        heading: 'Relayer Integrity & Non-Modification',
        body: 'A relaying device acts strictly as a courier. Because payloads are cryptographically signed prior to QR generation, relaying users cannot alter the recipient, amount, or signature of the transaction. However, HoneBill is not liable if a third-party relayer fails or delays forwarding a scanned payload to the GSM/SMS network.',
      },
      {
        ref: '5.4',
        heading: 'Settlement & Reconciliation',
        body: 'Offline transactions remain provisionally pending on the local device until received by the Zero-API Gateway, validated by the AWS-hosted backend, and settled on the Stellar Blockchain via Soroban Smart Contracts.',
      },
    ],
  },
  {
    id: 6,
    title: 'Prohibited Activities & Anti-Double-Spending',
    clauses: [
      {
        ref: '6.1',
        heading: 'Double-Spending Prevention',
        body: 'The Soroban Smart Contract enforces cryptographic verification and sequence checks to prevent duplicate transactions or double-spending attempts. Any attempt to manipulate local storage, replay signed SMS payloads, or spend unavailable funds will be automatically rejected on-chain and may result in permanent account suspension.',
      },
      {
        ref: '6.2',
        heading: 'Unlawful Use',
        body: 'You agree not to use HoneBill for money laundering, terrorist financing, fraud, or any illegal activities under Philippine law.',
      },
    ],
  },
  {
    id: 7,
    title: 'Limitation of Liability & Network Dependencies',
    clauses: [
      {
        ref: '7.1',
        heading: 'Third-Party Infrastructure',
        body: 'HoneBill relies on external telecommunications providers (2G/GSM cellular networks), cloud hosting infrastructure (AWS), and the decentralized Stellar Blockchain Network. HoneBill is not liable for transaction delays, SMS delivery failures, cellular dead zones, or ledger congestion caused by third-party network outages.',
      },
      {
        ref: '7.2',
        heading: 'Irreversibility of Blockchain Transactions',
        body: 'Once a transaction payload is broadcast and settled on the Stellar Blockchain, it is immutable and irreversible. HoneBill cannot cancel, reverse, or refund transfers sent to an incorrect recipient.',
      },
      {
        ref: '7.3',
        heading: '"As-Is" Provision',
        body: 'The System is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, whether express or implied.',
      },
    ],
  },
  {
    id: 8,
    title: 'Data Privacy & Security',
    clauses: [
      {
        ref: '8.1',
        heading: 'Information Security (CIA Triad)',
        body: 'HoneBill implements security controls aligned with the CIA Triad (Confidentiality, Integrity, and Availability), utilizing Ed25519 asymmetric cryptography, data compression, and secure local storage.',
      },
      {
        ref: '8.2',
        heading: 'Data Collection',
        body: 'By using the System, you consent to the collection and processing of your mobile number, KYC verification data, and on-chain/off-chain transaction logs solely for operating, validating, and securing the HoneBill service, in compliance with the Data Privacy Act of 2012 (Republic Act No. 10173).',
      },
    ],
  },
  {
    id: 9,
    title: 'Modifications and Governing Law',
    clauses: [
      {
        ref: '9.1',
        heading: 'Updates to Terms',
        body: 'We reserve the right to modify these Terms and Conditions at any time as the System evolves. Continued use of the application following updates constitutes acceptance of the revised terms.',
      },
      {
        ref: '9.2',
        heading: 'Governing Law',
        body: 'These Terms and Conditions shall be governed by and construed in accordance with the laws of the Republic of the Philippines. Any disputes arising out of or relating to the System shall be subject to the exclusive jurisdiction of the proper courts in Quezon City, Metro Manila.',
      },
    ],
  },
];

export const TERMS_CLOSING =
  'By tapping "I Agree" or creating a HoneBill wallet, you confirm that you have read, understood, and accepted these Terms and Conditions, including your sole responsibility for securing your Secret Recovery Phrase.';

/** The one acknowledgement the user must tick themselves, because losing the phrase is the costliest mistake. */
export const TERMS_ACK = 'I understand that only I can recover my wallet, and that lost Recovery Phrases cannot be reset.';
