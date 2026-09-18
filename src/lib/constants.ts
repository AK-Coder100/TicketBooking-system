/**
 * Centralized Site & Merchant Constants
 * All reusable business details, contact information, addresses, and platform settings.
 */

export const MERCHANT_CONFIG = {
  legalName: 'Pappu singh',
  operatingVenue: 'KACHERI Club, town hall, Gorakhpur, 273008',
  fullAddress: 'KACHERI Club, town hall, Gorakhpur, 273008, Uttar Pradesh, India',
  city: 'Gorakhpur',
  pincode: '273008',
  state: 'Uttar Pradesh',
  country: 'India',
  phones: [
    { display: '+91 9918327131', raw: '+919918327131' },
    { display: '+91 7607137577', raw: '+917607137577' },
    { display: '+91 7054488454', raw: '+917054488454' },
    { display: '+91 8858152101', raw: '+918858152101' }
  ],
  phoneDisplay: '+91 9918327131, +91 7607137577, +91 7054488454, +91 8858152101',
  supportEmail: 'support@neoclare.com',
  organizerEmails: ['srproduction091@gmail.com', 'ayushpandey10985@gmail.com'],
  supportHours: 'Mon–Sun, 9:00 AM – 9:00 PM IST',
  organizationNames: ['RB Garment Enterprises', 'SR Production', 'Annapurna Seva Samiti']
} as const;

export const SITE_CONFIG = {
  name: 'TicketBooking Platform',
  title: 'TicketBooking Platform - Live Festival & Event Passes',
  description: 'Multi-tenant live event ticketing & digital entry pass issuance platform. All ticket prices are listed and charged in INR (₹).',
  currency: 'INR',
  currencySymbol: '₹',
  domain: process.env.WHATSAPP_PUBLIC_BASE_URL || 'https://event.neoclare.com'
} as const;

export const NAV_LINKS = {
  home: '/',
  about: '/about',
  contact: '/contact',
  privacy: '/privacy',
  terms: '/terms',
  refunds: '/refunds',
  wallet: '/wallet',
  organizerLogin: '/organizer/login',
  adminLogin: '/admin/login'
} as const;
