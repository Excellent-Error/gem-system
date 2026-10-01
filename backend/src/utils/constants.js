export const STATUSES = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUOTED', 'WON', 'LOST', 'CLOSED'];

export const OPEN_STATUSES = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUOTED'];

export const DEFAULT_ENQUIRY_TYPES = [
  { key: 'general', label: 'General enquiry' },
  { key: 'quote', label: 'Request a quote' },
  { key: 'booking', label: 'Booking / appointment' },
  { key: 'partnership', label: 'Partnership / collaboration' },
  { key: 'other', label: 'Other' },
];

export const SORTABLE = ['created_at', 'preferred_date', 'follow_up_date', 'customer_name', 'status'];
