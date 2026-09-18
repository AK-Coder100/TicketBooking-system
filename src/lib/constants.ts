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
    { display: '+91 7607137577', raw: '+917607137577' }
  ],
  phoneDisplay: '+91 9918327131, +91 7607137577',
  supportEmail: 'support@neoclare.com',
  supportHours: 'Mon–Sat, 9:00 AM – 6:00 PM IST'
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
