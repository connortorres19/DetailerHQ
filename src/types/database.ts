
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity_events": {
                  Row: {
                    "actor_type": Database["public"]['Enums']["actor_type"],"actor_user_id": string | null,"appointment_id": string | null,"booking_request_id": string | null,"business_id": string,"created_at": string,"from_status": string | null,"id": string,"kind": string,"lead_id": string | null,"metadata": NonNullable<Json>,"quote_id": string | null,"to_status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_type": Database["public"]['Enums']["actor_type"],"actor_user_id"?: string | null,"appointment_id"?: string | null,"booking_request_id"?: string | null,"business_id": string,"created_at"?: string,"from_status"?: string | null,"id"?: string,"kind": string,"lead_id"?: string | null,"metadata"?: NonNullable<Json>,"quote_id"?: string | null,"to_status"?: string | null
                  }
                  Update: {
                    "actor_type"?: Database["public"]['Enums']["actor_type"],"actor_user_id"?: string | null,"appointment_id"?: string | null,"booking_request_id"?: string | null,"business_id"?: string,"created_at"?: string,"from_status"?: string | null,"id"?: string,"kind"?: string,"lead_id"?: string | null,"metadata"?: NonNullable<Json>,"quote_id"?: string | null,"to_status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_events_business_id_appointment_id_fkey"
      columns: ["business_id","appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "activity_events_business_id_booking_request_id_fkey"
      columns: ["business_id","booking_request_id"]
isOneToOne: false
      referencedRelation: "booking_requests"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "activity_events_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_business_id_lead_id_fkey"
      columns: ["business_id","lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "activity_events_business_id_quote_id_fkey"
      columns: ["business_id","quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"appointment_items": {
                  Row: {
                    "appointment_id": string,"business_id": string,"duration_min": number,"estimated_price_cents": number,"id": string,"name": string,"quantity": number,"recorded_price_cents": number | null,"service_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id": string,"business_id": string,"duration_min": number,"estimated_price_cents": number,"id"?: string,"name": string,"quantity"?: number,"recorded_price_cents"?: number | null,"service_id"?: string | null
                  }
                  Update: {
                    "appointment_id"?: string,"business_id"?: string,"duration_min"?: number,"estimated_price_cents"?: number,"id"?: string,"name"?: string,"quantity"?: number,"recorded_price_cents"?: number | null,"service_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointment_items_business_id_appointment_id_fkey"
      columns: ["business_id","appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "appointment_items_business_id_service_id_fkey"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"appointments": {
                  Row: {
                    "booking_request_id": string | null,"business_id": string,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": Database["public"]['Enums']["cancelled_by"] | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"customer_id": string,"customer_message": string | null,"ends_at": string,"estimated_total_cents": number,"id": string,"internal_notes": string | null,"lead_id": string | null,"location_type": Database["public"]['Enums']["location_type"],"number": number,"payment_note": Database["public"]['Enums']["payment_note"],"quote_id": string | null,"recorded_total_cents": number | null,"reschedule_requested_at": string | null,"resource_id": string,"service_address_line1": string | null,"service_city": string | null,"service_postal_code": string | null,"service_state": string | null,"source": Database["public"]['Enums']["appointment_source"],"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"updated_at": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_request_id"?: string | null,"business_id": string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: Database["public"]['Enums']["cancelled_by"] | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"customer_message"?: string | null,"ends_at": string,"estimated_total_cents"?: number,"id"?: string,"internal_notes"?: string | null,"lead_id"?: string | null,"location_type": Database["public"]['Enums']["location_type"],"number": number,"payment_note"?: Database["public"]['Enums']["payment_note"],"quote_id"?: string | null,"recorded_total_cents"?: number | null,"reschedule_requested_at"?: string | null,"resource_id": string,"service_address_line1"?: string | null,"service_city"?: string | null,"service_postal_code"?: string | null,"service_state"?: string | null,"source": Database["public"]['Enums']["appointment_source"],"starts_at": string,"status"?: Database["public"]['Enums']["appointment_status"],"updated_at"?: string,"vehicle_id": string
                  }
                  Update: {
                    "booking_request_id"?: string | null,"business_id"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: Database["public"]['Enums']["cancelled_by"] | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"customer_message"?: string | null,"ends_at"?: string,"estimated_total_cents"?: number,"id"?: string,"internal_notes"?: string | null,"lead_id"?: string | null,"location_type"?: Database["public"]['Enums']["location_type"],"number"?: number,"payment_note"?: Database["public"]['Enums']["payment_note"],"quote_id"?: string | null,"recorded_total_cents"?: number | null,"reschedule_requested_at"?: string | null,"resource_id"?: string,"service_address_line1"?: string | null,"service_city"?: string | null,"service_postal_code"?: string | null,"service_state"?: string | null,"source"?: Database["public"]['Enums']["appointment_source"],"starts_at"?: string,"status"?: Database["public"]['Enums']["appointment_status"],"updated_at"?: string,"vehicle_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_business_id_booking_request_id_fkey"
      columns: ["business_id","booking_request_id"]
isOneToOne: false
      referencedRelation: "booking_requests"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "appointments_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "appointments_business_id_customer_id_vehicle_id_fkey"
      columns: ["business_id","customer_id","vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["business_id","customer_id","id"]
    },{
      foreignKeyName: "appointments_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_business_id_lead_id_fkey"
      columns: ["business_id","lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "appointments_business_id_quote_id_fkey"
      columns: ["business_id","quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "appointments_business_id_resource_id_fkey"
      columns: ["business_id","resource_id"]
isOneToOne: false
      referencedRelation: "schedule_resources"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"availability_rules": {
                  Row: {
                    "business_id": string,"created_at": string,"end_time": string,"id": string,"start_time": string,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"end_time": string,"id"?: string,"start_time": string,"weekday": number
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"end_time"?: string,"id"?: string,"start_time"?: string,"weekday"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_rules_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"billing_events": {
                  Row: {
                    "attempts": number,"business_id": string | null,"error": string | null,"id": string,"outcome": string | null,"processed_at": string | null,"received_at": string,"stripe_created": string | null,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"business_id"?: string | null,"error"?: string | null,"id": string,"outcome"?: string | null,"processed_at"?: string | null,"received_at"?: string,"stripe_created"?: string | null,"type": string
                  }
                  Update: {
                    "attempts"?: number,"business_id"?: string | null,"error"?: string | null,"id"?: string,"outcome"?: string | null,"processed_at"?: string | null,"received_at"?: string,"stripe_created"?: string | null,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "billing_events_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_request_items": {
                  Row: {
                    "booking_request_id": string,"business_id": string,"duration_min": number,"id": string,"is_addon": boolean,"name": string,"price_cents": number,"price_type": Database["public"]['Enums']["price_type"],"service_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_request_id": string,"business_id": string,"duration_min": number,"id"?: string,"is_addon": boolean,"name": string,"price_cents": number,"price_type": Database["public"]['Enums']["price_type"],"service_id": string
                  }
                  Update: {
                    "booking_request_id"?: string,"business_id"?: string,"duration_min"?: number,"id"?: string,"is_addon"?: boolean,"name"?: string,"price_cents"?: number,"price_type"?: Database["public"]['Enums']["price_type"],"service_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_request_items_business_id_booking_request_id_fkey"
      columns: ["business_id","booking_request_id"]
isOneToOne: false
      referencedRelation: "booking_requests"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "booking_request_items_business_id_service_id_fkey"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"booking_requests": {
                  Row: {
                    "alternate_start": string | null,"business_id": string,"consent_at": string,"contact_email": string | null,"contact_first_name": string,"contact_last_name": string | null,"contact_phone_e164": string | null,"created_at": string,"customer_id": string | null,"customer_notes": string | null,"decided_at": string | null,"decided_by": string | null,"decline_message": string | null,"decline_reason": string | null,"duplicate_of_id": string | null,"estimate_is_minimum": boolean,"estimated_duration_min": number,"estimated_total_cents": number,"id": string,"idempotency_key": string,"ip_hash": string | null,"location_type": Database["public"]['Enums']["location_type"],"number": number,"preferred_contact": Database["public"]['Enums']["contact_preference"] | null,"proposal_expires_at": string | null,"proposal_message": string | null,"proposed_end": string | null,"proposed_start": string | null,"requested_end": string,"requested_start": string,"service_address_line1": string | null,"service_city": string | null,"service_postal_code": string | null,"service_state": string | null,"status": Database["public"]['Enums']["request_status"],"token_hash": string,"updated_at": string,"vehicle_color": string | null,"vehicle_id": string | null,"vehicle_make": string,"vehicle_model": string,"vehicle_notes": string | null,"vehicle_size_class_id": string,"vehicle_year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alternate_start"?: string | null,"business_id": string,"consent_at": string,"contact_email"?: string | null,"contact_first_name": string,"contact_last_name"?: string | null,"contact_phone_e164"?: string | null,"created_at"?: string,"customer_id"?: string | null,"customer_notes"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decline_message"?: string | null,"decline_reason"?: string | null,"duplicate_of_id"?: string | null,"estimate_is_minimum"?: boolean,"estimated_duration_min": number,"estimated_total_cents": number,"id"?: string,"idempotency_key": string,"ip_hash"?: string | null,"location_type": Database["public"]['Enums']["location_type"],"number": number,"preferred_contact"?: Database["public"]['Enums']["contact_preference"] | null,"proposal_expires_at"?: string | null,"proposal_message"?: string | null,"proposed_end"?: string | null,"proposed_start"?: string | null,"requested_end": string,"requested_start": string,"service_address_line1"?: string | null,"service_city"?: string | null,"service_postal_code"?: string | null,"service_state"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"token_hash": string,"updated_at"?: string,"vehicle_color"?: string | null,"vehicle_id"?: string | null,"vehicle_make": string,"vehicle_model": string,"vehicle_notes"?: string | null,"vehicle_size_class_id": string,"vehicle_year"?: number | null
                  }
                  Update: {
                    "alternate_start"?: string | null,"business_id"?: string,"consent_at"?: string,"contact_email"?: string | null,"contact_first_name"?: string,"contact_last_name"?: string | null,"contact_phone_e164"?: string | null,"created_at"?: string,"customer_id"?: string | null,"customer_notes"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decline_message"?: string | null,"decline_reason"?: string | null,"duplicate_of_id"?: string | null,"estimate_is_minimum"?: boolean,"estimated_duration_min"?: number,"estimated_total_cents"?: number,"id"?: string,"idempotency_key"?: string,"ip_hash"?: string | null,"location_type"?: Database["public"]['Enums']["location_type"],"number"?: number,"preferred_contact"?: Database["public"]['Enums']["contact_preference"] | null,"proposal_expires_at"?: string | null,"proposal_message"?: string | null,"proposed_end"?: string | null,"proposed_start"?: string | null,"requested_end"?: string,"requested_start"?: string,"service_address_line1"?: string | null,"service_city"?: string | null,"service_postal_code"?: string | null,"service_state"?: string | null,"status"?: Database["public"]['Enums']["request_status"],"token_hash"?: string,"updated_at"?: string,"vehicle_color"?: string | null,"vehicle_id"?: string | null,"vehicle_make"?: string,"vehicle_model"?: string,"vehicle_notes"?: string | null,"vehicle_size_class_id"?: string,"vehicle_year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_requests_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "booking_requests_business_id_customer_id_vehicle_id_fkey"
      columns: ["business_id","customer_id","vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["business_id","customer_id","id"]
    },{
      foreignKeyName: "booking_requests_business_id_duplicate_of_id_fkey"
      columns: ["business_id","duplicate_of_id"]
isOneToOne: false
      referencedRelation: "booking_requests"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "booking_requests_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "booking_requests_business_id_vehicle_size_class_id_fkey"
      columns: ["business_id","vehicle_size_class_id"]
isOneToOne: false
      referencedRelation: "vehicle_size_classes"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"booking_settings": {
                  Row: {
                    "booking_mode": Database["public"]['Enums']["booking_mode"],"buffer_min": number,"business_id": string,"cancel_cutoff_hours": number,"cancellation_policy_text": string | null,"customer_can_cancel": boolean,"default_hold_hours": number,"horizon_days": number,"intro_text": string | null,"max_jobs_per_day": number | null,"min_notice_min": number,"prep_instructions": string | null,"proposal_expiry_hours": number,"reschedule_cutoff_hours": number,"reschedule_policy_text": string | null,"slot_interval_min": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_mode"?: Database["public"]['Enums']["booking_mode"],"buffer_min"?: number,"business_id": string,"cancel_cutoff_hours"?: number,"cancellation_policy_text"?: string | null,"customer_can_cancel"?: boolean,"default_hold_hours"?: number,"horizon_days"?: number,"intro_text"?: string | null,"max_jobs_per_day"?: number | null,"min_notice_min"?: number,"prep_instructions"?: string | null,"proposal_expiry_hours"?: number,"reschedule_cutoff_hours"?: number,"reschedule_policy_text"?: string | null,"slot_interval_min"?: number,"updated_at"?: string
                  }
                  Update: {
                    "booking_mode"?: Database["public"]['Enums']["booking_mode"],"buffer_min"?: number,"business_id"?: string,"cancel_cutoff_hours"?: number,"cancellation_policy_text"?: string | null,"customer_can_cancel"?: boolean,"default_hold_hours"?: number,"horizon_days"?: number,"intro_text"?: string | null,"max_jobs_per_day"?: number | null,"min_notice_min"?: number,"prep_instructions"?: string | null,"proposal_expiry_hours"?: number,"reschedule_cutoff_hours"?: number,"reschedule_policy_text"?: string | null,"slot_interval_min"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_settings_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"business_billing": {
                  Row: {
                    "business_id": string,"cancel_at_period_end": boolean,"created_at": string,"current_period_end": string | null,"ever_paid": boolean,"founding_access_revoked_at": string | null,"founding_revoked_reason": string | null,"founding_slot": number | null,"has_payment_method": boolean,"last_synced_at": string | null,"past_due_since": string | null,"plan": Database["public"]['Enums']["billing_plan"] | null,"stripe_customer_id": string | null,"stripe_subscription_id": string | null,"subscription_status": string | null,"trial_ends_at": string | null,"trial_used": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"cancel_at_period_end"?: boolean,"created_at"?: string,"current_period_end"?: string | null,"ever_paid"?: boolean,"founding_access_revoked_at"?: string | null,"founding_revoked_reason"?: string | null,"founding_slot"?: number | null,"has_payment_method"?: boolean,"last_synced_at"?: string | null,"past_due_since"?: string | null,"plan"?: Database["public"]['Enums']["billing_plan"] | null,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"subscription_status"?: string | null,"trial_ends_at"?: string | null,"trial_used"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"cancel_at_period_end"?: boolean,"created_at"?: string,"current_period_end"?: string | null,"ever_paid"?: boolean,"founding_access_revoked_at"?: string | null,"founding_revoked_reason"?: string | null,"founding_slot"?: number | null,"has_payment_method"?: boolean,"last_synced_at"?: string | null,"past_due_since"?: string | null,"plan"?: Database["public"]['Enums']["billing_plan"] | null,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"subscription_status"?: string | null,"trial_ends_at"?: string | null,"trial_used"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_billing_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "business_billing_founding_slot_fkey"
      columns: ["founding_slot"]
isOneToOne: true
      referencedRelation: "founding_slots"
      referencedColumns: ["slot"]
    }
                  ]
                },"business_branding": {
                  Row: {
                    "accent_color": string | null,"business_id": string,"cover_asset_id": string | null,"draft": Json | null,"draft_updated_at": string | null,"gallery_asset_ids": (string)[],"logo_asset_id": string | null,"primary_color": string | null,"published_at": string | null,"secondary_color": string | null,"service_photos": NonNullable<Json>,"show_email": boolean,"social_links": NonNullable<Json>,"updated_at": string,"website_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accent_color"?: string | null,"business_id": string,"cover_asset_id"?: string | null,"draft"?: Json | null,"draft_updated_at"?: string | null,"gallery_asset_ids"?: (string)[],"logo_asset_id"?: string | null,"primary_color"?: string | null,"published_at"?: string | null,"secondary_color"?: string | null,"service_photos"?: NonNullable<Json>,"show_email"?: boolean,"social_links"?: NonNullable<Json>,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "accent_color"?: string | null,"business_id"?: string,"cover_asset_id"?: string | null,"draft"?: Json | null,"draft_updated_at"?: string | null,"gallery_asset_ids"?: (string)[],"logo_asset_id"?: string | null,"primary_color"?: string | null,"published_at"?: string | null,"secondary_color"?: string | null,"service_photos"?: NonNullable<Json>,"show_email"?: boolean,"social_links"?: NonNullable<Json>,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_branding_business_id_cover_asset_id_fkey"
      columns: ["business_id","cover_asset_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "business_branding_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "business_branding_business_id_logo_asset_id_fkey"
      columns: ["business_id","logo_asset_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"business_counters": {
                  Row: {
                    "business_id": string,"kind": string,"next_value": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"kind": string,"next_value"?: number
                  }
                  Update: {
                    "business_id"?: string,"kind"?: string,"next_value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "business_counters_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"businesses": {
                  Row: {
                    "accepting_requests": boolean,"access_restricted_at": string | null,"account_status": Database["public"]['Enums']["account_status"],"activated_at": string | null,"closure_requested_at": string | null,"created_at": string,"deletion_scheduled_for": string | null,"email": string | null,"id": string,"name": string,"phone_e164": string | null,"pilot_ends_at": string | null,"published_at": string | null,"service_area_text": string | null,"service_mode": Database["public"]['Enums']["service_mode"],"shop_address_line1": string | null,"shop_city": string | null,"shop_postal_code": string | null,"shop_state": string | null,"slug": string,"timezone": string,"trial_ends_at": string | null,"trial_started_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepting_requests"?: boolean,"access_restricted_at"?: string | null,"account_status"?: Database["public"]['Enums']["account_status"],"activated_at"?: string | null,"closure_requested_at"?: string | null,"created_at"?: string,"deletion_scheduled_for"?: string | null,"email"?: string | null,"id"?: string,"name": string,"phone_e164"?: string | null,"pilot_ends_at"?: string | null,"published_at"?: string | null,"service_area_text"?: string | null,"service_mode": Database["public"]['Enums']["service_mode"],"shop_address_line1"?: string | null,"shop_city"?: string | null,"shop_postal_code"?: string | null,"shop_state"?: string | null,"slug": string,"timezone": string,"trial_ends_at"?: string | null,"trial_started_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "accepting_requests"?: boolean,"access_restricted_at"?: string | null,"account_status"?: Database["public"]['Enums']["account_status"],"activated_at"?: string | null,"closure_requested_at"?: string | null,"created_at"?: string,"deletion_scheduled_for"?: string | null,"email"?: string | null,"id"?: string,"name"?: string,"phone_e164"?: string | null,"pilot_ends_at"?: string | null,"published_at"?: string | null,"service_area_text"?: string | null,"service_mode"?: Database["public"]['Enums']["service_mode"],"shop_address_line1"?: string | null,"shop_city"?: string | null,"shop_postal_code"?: string | null,"shop_state"?: string | null,"slug"?: string,"timezone"?: string,"trial_ends_at"?: string | null,"trial_started_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customers": {
                  Row: {
                    "address_line1": string | null,"anonymized_at": string | null,"archived_at": string | null,"business_id": string,"city": string | null,"created_at": string,"email": string | null,"first_name": string,"id": string,"last_name": string | null,"notes": string | null,"phone_e164": string | null,"postal_code": string | null,"preferred_contact": Database["public"]['Enums']["contact_preference"] | null,"source": Database["public"]['Enums']["lead_source"] | null,"state": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line1"?: string | null,"anonymized_at"?: string | null,"archived_at"?: string | null,"business_id": string,"city"?: string | null,"created_at"?: string,"email"?: string | null,"first_name": string,"id"?: string,"last_name"?: string | null,"notes"?: string | null,"phone_e164"?: string | null,"postal_code"?: string | null,"preferred_contact"?: Database["public"]['Enums']["contact_preference"] | null,"source"?: Database["public"]['Enums']["lead_source"] | null,"state"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address_line1"?: string | null,"anonymized_at"?: string | null,"archived_at"?: string | null,"business_id"?: string,"city"?: string | null,"created_at"?: string,"email"?: string | null,"first_name"?: string,"id"?: string,"last_name"?: string | null,"notes"?: string | null,"phone_e164"?: string | null,"postal_code"?: string | null,"preferred_contact"?: Database["public"]['Enums']["contact_preference"] | null,"source"?: Database["public"]['Enums']["lead_source"] | null,"state"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"email_connections": {
                  Row: {
                    "business_id": string,"connected_by": string | null,"created_at": string,"from_address": string,"from_name": string | null,"last_checked_at": string | null,"last_error": string | null,"last_error_at": string | null,"last_sent_at": string | null,"provider": Database["public"]['Enums']["email_provider"],"secret": string,"smtp_host": string | null,"smtp_port": number | null,"smtp_security": string | null,"smtp_username": string | null,"status": Database["public"]['Enums']["email_connection_status"],"updated_at": string,"verification_attempts": number,"verification_expires_at": string | null,"verification_hash": string | null,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"connected_by"?: string | null,"created_at"?: string,"from_address": string,"from_name"?: string | null,"last_checked_at"?: string | null,"last_error"?: string | null,"last_error_at"?: string | null,"last_sent_at"?: string | null,"provider": Database["public"]['Enums']["email_provider"],"secret": string,"smtp_host"?: string | null,"smtp_port"?: number | null,"smtp_security"?: string | null,"smtp_username"?: string | null,"status"?: Database["public"]['Enums']["email_connection_status"],"updated_at"?: string,"verification_attempts"?: number,"verification_expires_at"?: string | null,"verification_hash"?: string | null,"verified_at"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"connected_by"?: string | null,"created_at"?: string,"from_address"?: string,"from_name"?: string | null,"last_checked_at"?: string | null,"last_error"?: string | null,"last_error_at"?: string | null,"last_sent_at"?: string | null,"provider"?: Database["public"]['Enums']["email_provider"],"secret"?: string,"smtp_host"?: string | null,"smtp_port"?: number | null,"smtp_security"?: string | null,"smtp_username"?: string | null,"status"?: Database["public"]['Enums']["email_connection_status"],"updated_at"?: string,"verification_attempts"?: number,"verification_expires_at"?: string | null,"verification_hash"?: string | null,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_connections_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"email_outbox": {
                  Row: {
                    "attempts": number,"business_id": string,"category": string,"created_at": string,"id": string,"idempotency_key": string,"last_error": string | null,"locked_until": string | null,"next_attempt_at": string,"provider_message_id": string | null,"recipient": string,"refs": NonNullable<Json>,"sent_at": string | null,"status": Database["public"]['Enums']["email_status"],"template": Database["public"]['Enums']["email_template"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"business_id": string,"category"?: string,"created_at"?: string,"id"?: string,"idempotency_key": string,"last_error"?: string | null,"locked_until"?: string | null,"next_attempt_at"?: string,"provider_message_id"?: string | null,"recipient": string,"refs"?: NonNullable<Json>,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["email_status"],"template": Database["public"]['Enums']["email_template"],"updated_at"?: string
                  }
                  Update: {
                    "attempts"?: number,"business_id"?: string,"category"?: string,"created_at"?: string,"id"?: string,"idempotency_key"?: string,"last_error"?: string | null,"locked_until"?: string | null,"next_attempt_at"?: string,"provider_message_id"?: string | null,"recipient"?: string,"refs"?: NonNullable<Json>,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["email_status"],"template"?: Database["public"]['Enums']["email_template"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_outbox_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"email_owner_prefs": {
                  Row: {
                    "business_id": string,"prefs": NonNullable<Json>,"summary_hour": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"prefs"?: NonNullable<Json>,"summary_hour"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "business_id"?: string,"prefs"?: NonNullable<Json>,"summary_hour"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_owner_prefs_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"email_settings": {
                  Row: {
                    "business_id": string,"daily_limit": number,"reminder_hours": (number)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"daily_limit"?: number,"reminder_hours"?: (number)[],"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"daily_limit"?: number,"reminder_hours"?: (number)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_settings_business_id_fkey"
      columns: ["business_id"]
isOneToOne: true
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"email_suppressions": {
                  Row: {
                    "business_id": string,"category": string,"created_at": string,"email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"category": string,"created_at"?: string,"email": string
                  }
                  Update: {
                    "business_id"?: string,"category"?: string,"created_at"?: string,"email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_suppressions_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"email_template_settings": {
                  Row: {
                    "business_id": string,"enabled": boolean,"intro": string | null,"signoff": string | null,"subject": string | null,"template": Database["public"]['Enums']["email_template"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"enabled"?: boolean,"intro"?: string | null,"signoff"?: string | null,"subject"?: string | null,"template": Database["public"]['Enums']["email_template"],"updated_at"?: string
                  }
                  Update: {
                    "business_id"?: string,"enabled"?: boolean,"intro"?: string | null,"signoff"?: string | null,"subject"?: string | null,"template"?: Database["public"]['Enums']["email_template"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_template_settings_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"founding_slots": {
                  Row: {
                    "amount_cents": number | null,"business_id": string | null,"checkout_session_id": string | null,"claimed_at": string | null,"currency": string | null,"disputed_at": string | null,"refunded_at": string | null,"reserved_until": string | null,"slot": number,"state": string,"stripe_payment_intent": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number | null,"business_id"?: string | null,"checkout_session_id"?: string | null,"claimed_at"?: string | null,"currency"?: string | null,"disputed_at"?: string | null,"refunded_at"?: string | null,"reserved_until"?: string | null,"slot": number,"state"?: string,"stripe_payment_intent"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number | null,"business_id"?: string | null,"checkout_session_id"?: string | null,"claimed_at"?: string | null,"currency"?: string | null,"disputed_at"?: string | null,"refunded_at"?: string | null,"reserved_until"?: string | null,"slot"?: number,"state"?: string,"stripe_payment_intent"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "founding_slots_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "booking_request_id": string | null,"business_id": string,"contact_email": string | null,"contact_first_name": string,"contact_last_name": string | null,"contact_phone_e164": string | null,"created_at": string,"customer_id": string | null,"follow_up_note": string | null,"id": string,"last_contacted_at": string | null,"last_inbound_at": string | null,"lost_reason": Database["public"]['Enums']["lost_reason"] | null,"next_follow_up_at": string | null,"notes": string | null,"request_text": string | null,"service_id": string | null,"size_class_id": string | null,"source": Database["public"]['Enums']["lead_source"],"status": Database["public"]['Enums']["lead_status"],"updated_at": string,"vehicle_description": string | null,"vehicle_id": string | null,"vehicle_make": string | null,"vehicle_model": string | null,"vehicle_year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_request_id"?: string | null,"business_id": string,"contact_email"?: string | null,"contact_first_name": string,"contact_last_name"?: string | null,"contact_phone_e164"?: string | null,"created_at"?: string,"customer_id"?: string | null,"follow_up_note"?: string | null,"id"?: string,"last_contacted_at"?: string | null,"last_inbound_at"?: string | null,"lost_reason"?: Database["public"]['Enums']["lost_reason"] | null,"next_follow_up_at"?: string | null,"notes"?: string | null,"request_text"?: string | null,"service_id"?: string | null,"size_class_id"?: string | null,"source": Database["public"]['Enums']["lead_source"],"status"?: Database["public"]['Enums']["lead_status"],"updated_at"?: string,"vehicle_description"?: string | null,"vehicle_id"?: string | null,"vehicle_make"?: string | null,"vehicle_model"?: string | null,"vehicle_year"?: number | null
                  }
                  Update: {
                    "booking_request_id"?: string | null,"business_id"?: string,"contact_email"?: string | null,"contact_first_name"?: string,"contact_last_name"?: string | null,"contact_phone_e164"?: string | null,"created_at"?: string,"customer_id"?: string | null,"follow_up_note"?: string | null,"id"?: string,"last_contacted_at"?: string | null,"last_inbound_at"?: string | null,"lost_reason"?: Database["public"]['Enums']["lost_reason"] | null,"next_follow_up_at"?: string | null,"notes"?: string | null,"request_text"?: string | null,"service_id"?: string | null,"size_class_id"?: string | null,"source"?: Database["public"]['Enums']["lead_source"],"status"?: Database["public"]['Enums']["lead_status"],"updated_at"?: string,"vehicle_description"?: string | null,"vehicle_id"?: string | null,"vehicle_make"?: string | null,"vehicle_model"?: string | null,"vehicle_year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_business_id_booking_request_id_fkey"
      columns: ["business_id","booking_request_id"]
isOneToOne: false
      referencedRelation: "booking_requests"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "leads_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "leads_business_id_customer_id_vehicle_id_fkey"
      columns: ["business_id","customer_id","vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["business_id","customer_id","id"]
    },{
      foreignKeyName: "leads_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_business_id_service_id_fkey"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "leads_business_id_size_class_id_fkey"
      columns: ["business_id","size_class_id"]
isOneToOne: false
      referencedRelation: "vehicle_size_classes"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"media_assets": {
                  Row: {
                    "business_id": string,"bytes": number | null,"created_at": string,"height": number | null,"id": string,"kind": Database["public"]['Enums']["media_kind"],"ready_at": string | null,"status": Database["public"]['Enums']["media_status"],"storage_path": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"bytes"?: number | null,"created_at"?: string,"height"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["media_kind"],"ready_at"?: string | null,"status"?: Database["public"]['Enums']["media_status"],"storage_path"?: never,"width"?: number | null
                  }
                  Update: {
                    "business_id"?: string,"bytes"?: number | null,"created_at"?: string,"height"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["media_kind"],"ready_at"?: string | null,"status"?: Database["public"]['Enums']["media_status"],"storage_path"?: never,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_assets_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "business_id": string,"created_at": string,"role": Database["public"]['Enums']["membership_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"role"?: Database["public"]['Enums']["membership_role"],"user_id": string
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"role"?: Database["public"]['Enums']["membership_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"quote_items": {
                  Row: {
                    "business_id": string,"created_at": string,"description": string | null,"duration_min": number | null,"id": string,"name": string,"price_cents": number,"quantity": number,"quote_id": string,"service_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"description"?: string | null,"duration_min"?: number | null,"id"?: string,"name": string,"price_cents": number,"quantity"?: number,"quote_id": string,"service_id"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"description"?: string | null,"duration_min"?: number | null,"id"?: string,"name"?: string,"price_cents"?: number,"quantity"?: number,"quote_id"?: string,"service_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quote_items_business_id_quote_id_fkey"
      columns: ["business_id","quote_id"]
isOneToOne: false
      referencedRelation: "quotes"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "quote_items_business_id_service_id_fkey"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"quotes": {
                  Row: {
                    "business_id": string,"created_at": string,"customer_id": string | null,"decided_at": string | null,"discount_cents": number,"follow_up_note": string | null,"id": string,"internal_notes": string | null,"lead_id": string | null,"link_version": number | null,"next_follow_up_at": string | null,"notes": string | null,"number": number,"proposed_start": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["quote_status"],"subtotal_cents": number,"terms": string | null,"token_hash": string | null,"token_nonce": string | null,"total_cents": number,"updated_at": string,"valid_until": string | null,"vehicle_id": string | null,"vehicle_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"customer_id"?: string | null,"decided_at"?: string | null,"discount_cents"?: number,"follow_up_note"?: string | null,"id"?: string,"internal_notes"?: string | null,"lead_id"?: string | null,"link_version"?: number | null,"next_follow_up_at"?: string | null,"notes"?: string | null,"number": number,"proposed_start"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal_cents"?: number,"terms"?: string | null,"token_hash"?: string | null,"token_nonce"?: string | null,"total_cents"?: number,"updated_at"?: string,"valid_until"?: string | null,"vehicle_id"?: string | null,"vehicle_text"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"customer_id"?: string | null,"decided_at"?: string | null,"discount_cents"?: number,"follow_up_note"?: string | null,"id"?: string,"internal_notes"?: string | null,"lead_id"?: string | null,"link_version"?: number | null,"next_follow_up_at"?: string | null,"notes"?: string | null,"number"?: number,"proposed_start"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal_cents"?: number,"terms"?: string | null,"token_hash"?: string | null,"token_nonce"?: string | null,"total_cents"?: number,"updated_at"?: string,"valid_until"?: string | null,"vehicle_id"?: string | null,"vehicle_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "quotes_business_id_customer_id_vehicle_id_fkey"
      columns: ["business_id","customer_id","vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["business_id","customer_id","id"]
    },{
      foreignKeyName: "quotes_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "quotes_business_id_lead_id_fkey"
      columns: ["business_id","lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"rate_limit_events": {
                  Row: {
                    "action": string,"business_id": string | null,"created_at": string,"id": number,"key_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"business_id"?: string | null,"created_at"?: string,"id"?: never,"key_hash": string
                  }
                  Update: {
                    "action"?: string,"business_id"?: string | null,"created_at"?: string,"id"?: never,"key_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rate_limit_events_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_blocks": {
                  Row: {
                    "appointment_id": string | null,"booking_request_id": string | null,"business_id": string,"created_at": string,"created_by": string | null,"during": unknown,"expires_at": string | null,"id": string,"kind": Database["public"]['Enums']["block_kind"],"note": string | null,"resource_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "appointment_id"?: string | null,"booking_request_id"?: string | null,"business_id": string,"created_at"?: string,"created_by"?: string | null,"during": unknown,"expires_at"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["block_kind"],"note"?: string | null,"resource_id": string
                  }
                  Update: {
                    "appointment_id"?: string | null,"booking_request_id"?: string | null,"business_id"?: string,"created_at"?: string,"created_by"?: string | null,"during"?: unknown,"expires_at"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["block_kind"],"note"?: string | null,"resource_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_blocks_business_id_appointment_id_fkey"
      columns: ["business_id","appointment_id"]
isOneToOne: false
      referencedRelation: "appointments"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "schedule_blocks_business_id_booking_request_id_fkey"
      columns: ["business_id","booking_request_id"]
isOneToOne: false
      referencedRelation: "booking_requests"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "schedule_blocks_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_blocks_business_id_resource_id_fkey"
      columns: ["business_id","resource_id"]
isOneToOne: false
      referencedRelation: "schedule_resources"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"schedule_resources": {
                  Row: {
                    "active": boolean,"business_id": string,"capacity": number,"created_at": string,"id": string,"kind": Database["public"]['Enums']["resource_kind"],"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"business_id": string,"capacity": number,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["resource_kind"],"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"business_id"?: string,"capacity"?: number,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["resource_kind"],"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_resources_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"service_categories": {
                  Row: {
                    "business_id": string,"created_at": string,"id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_categories_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"service_prices": {
                  Row: {
                    "business_id": string,"duration_min": number | null,"price_cents": number | null,"service_id": string,"size_class_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"duration_min"?: number | null,"price_cents"?: number | null,"service_id": string,"size_class_id": string
                  }
                  Update: {
                    "business_id"?: string,"duration_min"?: number | null,"price_cents"?: number | null,"service_id"?: string,"size_class_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_prices_business_id_service_id_fkey"
      columns: ["business_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "service_prices_business_id_size_class_id_fkey"
      columns: ["business_id","size_class_id"]
isOneToOne: false
      referencedRelation: "vehicle_size_classes"
      referencedColumns: ["business_id","id"]
    }
                  ]
                },"services": {
                  Row: {
                    "archived_at": string | null,"base_duration_min": number,"base_price_cents": number | null,"business_id": string,"category_id": string | null,"created_at": string,"description": string | null,"follow_up_after_days": number | null,"id": string,"is_addon": boolean,"is_bookable": boolean,"name": string,"price_type": Database["public"]['Enums']["price_type"],"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"base_duration_min": number,"base_price_cents"?: number | null,"business_id": string,"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"follow_up_after_days"?: number | null,"id"?: string,"is_addon"?: boolean,"is_bookable"?: boolean,"name": string,"price_type": Database["public"]['Enums']["price_type"],"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"base_duration_min"?: number,"base_price_cents"?: number | null,"business_id"?: string,"category_id"?: string | null,"created_at"?: string,"description"?: string | null,"follow_up_after_days"?: number | null,"id"?: string,"is_addon"?: boolean,"is_bookable"?: boolean,"name"?: string,"price_type"?: Database["public"]['Enums']["price_type"],"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_business_id_category_id_fkey"
      columns: ["business_id","category_id"]
isOneToOne: false
      referencedRelation: "service_categories"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "services_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"time_off": {
                  Row: {
                    "all_day": boolean,"business_id": string,"created_at": string,"during": unknown,"id": string,"label": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"business_id": string,"created_at"?: string,"during": unknown,"id"?: string,"label"?: string | null
                  }
                  Update: {
                    "all_day"?: boolean,"business_id"?: string,"created_at"?: string,"during"?: unknown,"id"?: string,"label"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "time_off_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"user_preferences": {
                  Row: {
                    "theme": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "theme"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "theme"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"vehicle_size_classes": {
                  Row: {
                    "archived_at": string | null,"business_id": string,"created_at": string,"examples": string | null,"id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"business_id": string,"created_at"?: string,"examples"?: string | null,"id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"business_id"?: string,"created_at"?: string,"examples"?: string | null,"id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicle_size_classes_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    }
                  ]
                },"vehicles": {
                  Row: {
                    "archived_at": string | null,"business_id": string,"color": string | null,"created_at": string,"customer_id": string,"id": string,"make": string,"model": string,"notes": string | null,"plate": string | null,"size_class_id": string | null,"trim": string | null,"updated_at": string,"year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"business_id": string,"color"?: string | null,"created_at"?: string,"customer_id": string,"id"?: string,"make": string,"model": string,"notes"?: string | null,"plate"?: string | null,"size_class_id"?: string | null,"trim"?: string | null,"updated_at"?: string,"year"?: number | null
                  }
                  Update: {
                    "archived_at"?: string | null,"business_id"?: string,"color"?: string | null,"created_at"?: string,"customer_id"?: string,"id"?: string,"make"?: string,"model"?: string,"notes"?: string | null,"plate"?: string | null,"size_class_id"?: string | null,"trim"?: string | null,"updated_at"?: string,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicles_business_id_customer_id_fkey"
      columns: ["business_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["business_id","id"]
    },{
      foreignKeyName: "vehicles_business_id_fkey"
      columns: ["business_id"]
isOneToOne: false
      referencedRelation: "businesses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicles_business_id_size_class_id_fkey"
      columns: ["business_id","size_class_id"]
isOneToOne: false
      referencedRelation: "vehicle_size_classes"
      referencedColumns: ["business_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "activate_business":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"add_time_off":
{ Args: { "p_end_date": string,"p_end_time"?: string,"p_label"?: string,"p_start_date": string,"p_start_time"?: string }; Returns: string
                           },
"approve_request":
{ Args: { "p_customer_id"?: string,"p_request_id": string,"p_vehicle_id"?: string }; Returns: string
                           },
"begin_media_upload":
{ Args: { "p_kind": Database["public"]['Enums']["media_kind"] }; Returns: string
                           },
"cancel_appointment":
{ Args: { "p_appointment_id": string,"p_customer_message"?: string,"p_reason"?: string }; Returns: undefined
                           },
"cancel_email":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancel_media_upload":
{ Args: { "p_asset": string }; Returns: string
                           },
"close_duplicate":
{ Args: { "p_duplicate_of": string,"p_request_id": string }; Returns: undefined
                           },
"complete_appointment":
{ Args: { "p_appointment_id": string,"p_payment_note"?: Database["public"]['Enums']["payment_note"],"p_recorded_total_cents"?: number }; Returns: undefined
                           },
"complete_follow_up":
{ Args: { "p_lead_id": string,"p_note"?: string,"p_quote_id": string }; Returns: undefined
                           },
"convert_lead_to_customer":
{ Args: { "p_customer_id"?: string,"p_lead_id": string }; Returns: string
                           },
"convert_quote":
{ Args: { "p_address": Json,"p_duration_min"?: number,"p_location_type": Database["public"]['Enums']["location_type"],"p_quote_id": string,"p_starts_at": string }; Returns: string
                           },
"create_appointment":
{ Args: { "p_customer_id": string,"p_duration_min"?: number,"p_location_type": Database["public"]['Enums']["location_type"],"p_service_address"?: Json,"p_service_ids": (string)[],"p_starts_at": string,"p_vehicle_id": string }; Returns: string
                           },
"create_business":
{ Args: { "p_capacity"?: number,"p_email"?: string,"p_name": string,"p_phone_e164"?: string,"p_service_mode": Database["public"]['Enums']["service_mode"],"p_slug": string,"p_timezone": string }; Returns: string
                           },
"create_owner_appointment":
{ Args: { "p_address": Json,"p_customer": Json,"p_customer_id": string,"p_hold_id"?: string,"p_internal_notes"?: string,"p_location_type": Database["public"]['Enums']["location_type"],"p_service_ids": (string)[],"p_size_class_id": string,"p_source": Database["public"]['Enums']["appointment_source"],"p_starts_at": string,"p_vehicle": Json,"p_vehicle_id": string }; Returns: string
                           },
"decline_request":
{ Args: { "p_customer_message"?: string,"p_internal_reason"?: string,"p_request_id": string }; Returns: undefined
                           },
"delete_quote":
{ Args: { "p_quote_id": string }; Returns: undefined
                           },
"discard_branding_draft":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"disconnect_email":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"finish_media_upload":
{ Args: { "p_asset": string,"p_height": number,"p_service_id"?: string,"p_width": number }; Returns: undefined
                           },
"founding_availability":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"log_lead_activity":
{ Args: { "p_channel"?: string,"p_kind": string,"p_lead_id": string,"p_note"?: string }; Returns: undefined
                           },
"mark_no_show":
{ Args: { "p_appointment_id": string }; Returns: undefined
                           },
"media_garbage":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"owner_available_slots":
{ Args: { "p_days": number,"p_from": string,"p_service_ids": (string)[],"p_size_class_id": string }; Returns: Json
                           },
"owner_slots_for_duration":
{ Args: { "p_days": number,"p_duration_min": number,"p_from": string }; Returns: Json
                           },
"place_calendar_hold":
{ Args: { "p_ends_at": string,"p_hours": number,"p_note"?: string,"p_starts_at": string }; Returns: string
                           },
"place_hold":
{ Args: { "p_hours"?: number,"p_request_id": string }; Returns: string
                           },
"preview_available_slots":
{ Args: { "p_days": number,"p_from": string,"p_service_ids": (string)[],"p_size_class_id": string }; Returns: Json
                           },
"preview_booking_page":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"preview_branding_draft":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"propose_time":
{ Args: { "p_customer_id"?: string,"p_expires_hours"?: number,"p_message"?: string,"p_request_id": string,"p_start": string,"p_vehicle_id"?: string }; Returns: string
                           },
"publish_branding":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"purge_media":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"queue_test_email":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"release_calendar_hold":
{ Args: { "p_block_id": string }; Returns: boolean
                           },
"release_hold":
{ Args: { "p_request_id": string }; Returns: boolean
                           },
"reopen_appointment":
{ Args: { "p_appointment_id": string }; Returns: undefined
                           },
"reschedule_appointment":
{ Args: { "p_appointment_id": string,"p_duration_min"?: number,"p_starts_at": string }; Returns: undefined
                           },
"retract_proposal":
{ Args: { "p_request_id": string }; Returns: undefined
                           },
"retry_email":
{ Args: { "p_id": string }; Returns: undefined
                           },
"save_branding_draft":
{ Args: { "p_draft": Json }; Returns: undefined
                           },
"save_email_connection":
{ Args: { "p_from": string,"p_from_name": string,"p_provider": Database["public"]['Enums']["email_provider"],"p_secret": string,"p_smtp_host"?: string,"p_smtp_port"?: number,"p_smtp_security"?: string,"p_smtp_username"?: string }; Returns: string
                           },
"save_email_settings":
{ Args: { "p_reminder_hours": (number)[],"p_templates": Json }; Returns: undefined
                           },
"save_email_template":
{ Args: { "p_intro": string,"p_signoff": string,"p_subject": string,"p_template": Database["public"]['Enums']["email_template"] }; Returns: undefined
                           },
"save_owner_email_prefs":
{ Args: { "p_prefs": Json,"p_summary_hour": number }; Returns: undefined
                           },
"save_quote":
{ Args: { "p_customer": Json,"p_customer_id": string,"p_items": Json,"p_quote": Json,"p_quote_id": string,"p_vehicle": Json,"p_vehicle_id": string }; Returns: string
                           },
"save_service":
{ Args: { "p_prices": Json,"p_service": Json,"p_service_id": string }; Returns: string
                           },
"save_weekly_hours":
{ Args: { "p_windows": Json }; Returns: number
                           },
"send_quote":
{ Args: { "p_link_key": string,"p_quote_id": string }; Returns: string
                           },
"set_booking_page_live":
{ Args: { "p_live": boolean }; Returns: boolean
                           },
"set_capacity":
{ Args: { "p_capacity": number }; Returns: undefined
                           },
"start_appointment":
{ Args: { "p_appointment_id": string }; Returns: undefined
                           },
"start_founding_reservation":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"verify_email_code":
{ Args: { "p_code": string }; Returns: boolean
                           },
"withdraw_quote":
{ Args: { "p_quote_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "account_status": "pending_activation"|"pilot"|"trialing"|"active"|"past_due"|"trial_expired"|"inactive"|"cancelled"|"suspended"|"closing","actor_type": "owner"|"customer"|"system"|"operator","appointment_source": "booking_page"|"phone"|"text"|"walk_in"|"in_person"|"other"|"quote","appointment_status": "scheduled"|"in_progress"|"completed"|"cancelled"|"no_show","billing_plan": "founding"|"standard","block_kind": "appointment"|"hold"|"proposal","booking_mode": "approval"|"instant","cancelled_by": "customer"|"business","contact_preference": "call"|"text"|"email","email_connection_status": "pending"|"verified"|"needs_attention","email_provider": "google"|"microsoft"|"smtp","email_status": "queued"|"sending"|"sent"|"failed"|"held"|"skipped"|"cancelled","email_template": "request_received"|"booking_confirmed"|"booking_declined"|"time_proposed"|"proposal_accepted"|"proposal_declined"|"booking_rescheduled"|"booking_cancelled"|"appointment_reminder"|"quote_sent"|"quote_accepted"|"quote_declined"|"quote_expiring"|"quote_expired"|"owner_new_request"|"owner_new_appointment"|"owner_new_lead"|"owner_customer_response"|"owner_daily_summary"|"owner_overdue_followups"|"connection_test","lead_source": "booking_page"|"phone"|"text"|"instagram"|"facebook"|"google"|"referral"|"walk_in"|"repeat"|"other"|"website"|"social_media","lead_status": "new"|"contacted"|"quote_sent"|"follow_up_due"|"booked"|"lost","location_type": "mobile"|"shop","lost_reason": "price"|"timing"|"went_elsewhere"|"no_response"|"not_a_fit"|"other","media_kind": "logo"|"cover"|"gallery"|"service","media_status": "pending"|"ready"|"deleting","membership_role": "owner","payment_note": "not_recorded"|"unpaid"|"paid_cash"|"paid_card"|"paid_transfer"|"paid_other","price_type": "fixed"|"starting_at"|"quote_required","quote_status": "draft"|"sent"|"accepted"|"declined"|"expired"|"converted","request_status": "pending"|"time_proposed"|"approved"|"declined"|"proposal_declined"|"withdrawn"|"expired"|"closed_duplicate","resource_kind": "general"|"bay"|"staff"|"equipment","service_mode": "mobile"|"shop"|"both"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "account_status": ["pending_activation", "pilot", "trialing", "active", "past_due", "trial_expired", "inactive", "cancelled", "suspended", "closing"],"actor_type": ["owner", "customer", "system", "operator"],"appointment_source": ["booking_page", "phone", "text", "walk_in", "in_person", "other", "quote"],"appointment_status": ["scheduled", "in_progress", "completed", "cancelled", "no_show"],"billing_plan": ["founding", "standard"],"block_kind": ["appointment", "hold", "proposal"],"booking_mode": ["approval", "instant"],"cancelled_by": ["customer", "business"],"contact_preference": ["call", "text", "email"],"email_connection_status": ["pending", "verified", "needs_attention"],"email_provider": ["google", "microsoft", "smtp"],"email_status": ["queued", "sending", "sent", "failed", "held", "skipped", "cancelled"],"email_template": ["request_received", "booking_confirmed", "booking_declined", "time_proposed", "proposal_accepted", "proposal_declined", "booking_rescheduled", "booking_cancelled", "appointment_reminder", "quote_sent", "quote_accepted", "quote_declined", "quote_expiring", "quote_expired", "owner_new_request", "owner_new_appointment", "owner_new_lead", "owner_customer_response", "owner_daily_summary", "owner_overdue_followups", "connection_test"],"lead_source": ["booking_page", "phone", "text", "instagram", "facebook", "google", "referral", "walk_in", "repeat", "other", "website", "social_media"],"lead_status": ["new", "contacted", "quote_sent", "follow_up_due", "booked", "lost"],"location_type": ["mobile", "shop"],"lost_reason": ["price", "timing", "went_elsewhere", "no_response", "not_a_fit", "other"],"media_kind": ["logo", "cover", "gallery", "service"],"media_status": ["pending", "ready", "deleting"],"membership_role": ["owner"],"payment_note": ["not_recorded", "unpaid", "paid_cash", "paid_card", "paid_transfer", "paid_other"],"price_type": ["fixed", "starting_at", "quote_required"],"quote_status": ["draft", "sent", "accepted", "declined", "expired", "converted"],"request_status": ["pending", "time_proposed", "approved", "declined", "proposal_declined", "withdrawn", "expired", "closed_duplicate"],"resource_kind": ["general", "bay", "staff", "equipment"],"service_mode": ["mobile", "shop", "both"]
          }
        }
} as const
