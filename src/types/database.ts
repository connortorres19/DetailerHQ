
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
                    "booking_request_id": string | null,"business_id": string,"cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": Database["public"]['Enums']["cancelled_by"] | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"customer_id": string,"customer_message": string | null,"ends_at": string,"estimated_total_cents": number,"id": string,"internal_notes": string | null,"lead_id": string | null,"location_type": Database["public"]['Enums']["location_type"],"number": number,"payment_note": Database["public"]['Enums']["payment_note"],"quote_id": string | null,"recorded_total_cents": number | null,"reschedule_requested_at": string | null,"resource_id": string,"service_address_line1": string | null,"service_city": string | null,"service_postal_code": string | null,"service_state": string | null,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"updated_at": string,"vehicle_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_request_id"?: string | null,"business_id": string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: Database["public"]['Enums']["cancelled_by"] | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"customer_message"?: string | null,"ends_at": string,"estimated_total_cents"?: number,"id"?: string,"internal_notes"?: string | null,"lead_id"?: string | null,"location_type": Database["public"]['Enums']["location_type"],"number": number,"payment_note"?: Database["public"]['Enums']["payment_note"],"quote_id"?: string | null,"recorded_total_cents"?: number | null,"reschedule_requested_at"?: string | null,"resource_id": string,"service_address_line1"?: string | null,"service_city"?: string | null,"service_postal_code"?: string | null,"service_state"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["appointment_status"],"updated_at"?: string,"vehicle_id": string
                  }
                  Update: {
                    "booking_request_id"?: string | null,"business_id"?: string,"cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: Database["public"]['Enums']["cancelled_by"] | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"customer_message"?: string | null,"ends_at"?: string,"estimated_total_cents"?: number,"id"?: string,"internal_notes"?: string | null,"lead_id"?: string | null,"location_type"?: Database["public"]['Enums']["location_type"],"number"?: number,"payment_note"?: Database["public"]['Enums']["payment_note"],"quote_id"?: string | null,"recorded_total_cents"?: number | null,"reschedule_requested_at"?: string | null,"resource_id"?: string,"service_address_line1"?: string | null,"service_city"?: string | null,"service_postal_code"?: string | null,"service_state"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["appointment_status"],"updated_at"?: string,"vehicle_id"?: string
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
                },"leads": {
                  Row: {
                    "booking_request_id": string | null,"business_id": string,"contact_email": string | null,"contact_first_name": string,"contact_last_name": string | null,"contact_phone_e164": string | null,"created_at": string,"customer_id": string | null,"id": string,"last_inbound_at": string | null,"lost_reason": Database["public"]['Enums']["lost_reason"] | null,"next_follow_up_at": string | null,"request_text": string | null,"source": Database["public"]['Enums']["lead_source"],"status": Database["public"]['Enums']["lead_status"],"updated_at": string,"vehicle_description": string | null,"vehicle_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_request_id"?: string | null,"business_id": string,"contact_email"?: string | null,"contact_first_name": string,"contact_last_name"?: string | null,"contact_phone_e164"?: string | null,"created_at"?: string,"customer_id"?: string | null,"id"?: string,"last_inbound_at"?: string | null,"lost_reason"?: Database["public"]['Enums']["lost_reason"] | null,"next_follow_up_at"?: string | null,"request_text"?: string | null,"source": Database["public"]['Enums']["lead_source"],"status"?: Database["public"]['Enums']["lead_status"],"updated_at"?: string,"vehicle_description"?: string | null,"vehicle_id"?: string | null
                  }
                  Update: {
                    "booking_request_id"?: string | null,"business_id"?: string,"contact_email"?: string | null,"contact_first_name"?: string,"contact_last_name"?: string | null,"contact_phone_e164"?: string | null,"created_at"?: string,"customer_id"?: string | null,"id"?: string,"last_inbound_at"?: string | null,"lost_reason"?: Database["public"]['Enums']["lost_reason"] | null,"next_follow_up_at"?: string | null,"request_text"?: string | null,"source"?: Database["public"]['Enums']["lead_source"],"status"?: Database["public"]['Enums']["lead_status"],"updated_at"?: string,"vehicle_description"?: string | null,"vehicle_id"?: string | null
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
                    "business_id": string,"created_at": string,"customer_id": string | null,"decided_at": string | null,"discount_cents": number,"id": string,"lead_id": string | null,"notes": string | null,"number": number,"sent_at": string | null,"status": Database["public"]['Enums']["quote_status"],"subtotal_cents": number,"terms": string | null,"token_hash": string | null,"total_cents": number,"updated_at": string,"valid_until": string | null,"vehicle_id": string | null,"vehicle_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "business_id": string,"created_at"?: string,"customer_id"?: string | null,"decided_at"?: string | null,"discount_cents"?: number,"id"?: string,"lead_id"?: string | null,"notes"?: string | null,"number": number,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal_cents"?: number,"terms"?: string | null,"token_hash"?: string | null,"total_cents"?: number,"updated_at"?: string,"valid_until"?: string | null,"vehicle_id"?: string | null,"vehicle_text"?: string | null
                  }
                  Update: {
                    "business_id"?: string,"created_at"?: string,"customer_id"?: string | null,"decided_at"?: string | null,"discount_cents"?: number,"id"?: string,"lead_id"?: string | null,"notes"?: string | null,"number"?: number,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["quote_status"],"subtotal_cents"?: number,"terms"?: string | null,"token_hash"?: string | null,"total_cents"?: number,"updated_at"?: string,"valid_until"?: string | null,"vehicle_id"?: string | null,"vehicle_text"?: string | null
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
"cancel_appointment":
{ Args: { "p_appointment_id": string,"p_customer_message"?: string,"p_reason"?: string }; Returns: undefined
                           },
"close_duplicate":
{ Args: { "p_duplicate_of": string,"p_request_id": string }; Returns: undefined
                           },
"complete_appointment":
{ Args: { "p_appointment_id": string,"p_payment_note"?: Database["public"]['Enums']["payment_note"],"p_recorded_total_cents"?: number }; Returns: undefined
                           },
"create_appointment":
{ Args: { "p_customer_id": string,"p_duration_min"?: number,"p_location_type": Database["public"]['Enums']["location_type"],"p_service_address"?: Json,"p_service_ids": (string)[],"p_starts_at": string,"p_vehicle_id": string }; Returns: string
                           },
"create_business":
{ Args: { "p_capacity"?: number,"p_email"?: string,"p_name": string,"p_phone_e164"?: string,"p_service_mode": Database["public"]['Enums']["service_mode"],"p_slug": string,"p_timezone": string }; Returns: string
                           },
"decline_request":
{ Args: { "p_customer_message"?: string,"p_internal_reason"?: string,"p_request_id": string }; Returns: undefined
                           },
"mark_no_show":
{ Args: { "p_appointment_id": string }; Returns: undefined
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
"propose_time":
{ Args: { "p_customer_id"?: string,"p_expires_hours"?: number,"p_message"?: string,"p_request_id": string,"p_start": string,"p_vehicle_id"?: string }; Returns: string
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
"save_service":
{ Args: { "p_prices": Json,"p_service": Json,"p_service_id": string }; Returns: string
                           },
"save_weekly_hours":
{ Args: { "p_windows": Json }; Returns: number
                           },
"set_booking_page_live":
{ Args: { "p_live": boolean }; Returns: boolean
                           },
"set_capacity":
{ Args: { "p_capacity": number }; Returns: undefined
                           },
"start_appointment":
{ Args: { "p_appointment_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "account_status": "pending_activation"|"pilot"|"trialing"|"active"|"past_due"|"trial_expired"|"inactive"|"cancelled"|"suspended"|"closing","actor_type": "owner"|"customer"|"system"|"operator","appointment_status": "scheduled"|"in_progress"|"completed"|"cancelled"|"no_show","block_kind": "appointment"|"hold"|"proposal","booking_mode": "approval"|"instant","cancelled_by": "customer"|"business","contact_preference": "call"|"text"|"email","lead_source": "booking_page"|"phone"|"text"|"instagram"|"facebook"|"google"|"referral"|"walk_in"|"repeat"|"other","lead_status": "new"|"contacted"|"quote_sent"|"follow_up_due"|"booked"|"lost","location_type": "mobile"|"shop","lost_reason": "price"|"timing"|"went_elsewhere"|"no_response"|"not_a_fit"|"other","membership_role": "owner","payment_note": "not_recorded"|"unpaid"|"paid_cash"|"paid_card"|"paid_transfer"|"paid_other","price_type": "fixed"|"starting_at"|"quote_required","quote_status": "draft"|"sent"|"accepted"|"declined"|"expired","request_status": "pending"|"time_proposed"|"approved"|"declined"|"proposal_declined"|"withdrawn"|"expired"|"closed_duplicate","resource_kind": "general"|"bay"|"staff"|"equipment","service_mode": "mobile"|"shop"|"both"
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
            "account_status": ["pending_activation", "pilot", "trialing", "active", "past_due", "trial_expired", "inactive", "cancelled", "suspended", "closing"],"actor_type": ["owner", "customer", "system", "operator"],"appointment_status": ["scheduled", "in_progress", "completed", "cancelled", "no_show"],"block_kind": ["appointment", "hold", "proposal"],"booking_mode": ["approval", "instant"],"cancelled_by": ["customer", "business"],"contact_preference": ["call", "text", "email"],"lead_source": ["booking_page", "phone", "text", "instagram", "facebook", "google", "referral", "walk_in", "repeat", "other"],"lead_status": ["new", "contacted", "quote_sent", "follow_up_due", "booked", "lost"],"location_type": ["mobile", "shop"],"lost_reason": ["price", "timing", "went_elsewhere", "no_response", "not_a_fit", "other"],"membership_role": ["owner"],"payment_note": ["not_recorded", "unpaid", "paid_cash", "paid_card", "paid_transfer", "paid_other"],"price_type": ["fixed", "starting_at", "quote_required"],"quote_status": ["draft", "sent", "accepted", "declined", "expired"],"request_status": ["pending", "time_proposed", "approved", "declined", "proposal_declined", "withdrawn", "expired", "closed_duplicate"],"resource_kind": ["general", "bay", "staff", "equipment"],"service_mode": ["mobile", "shop", "both"]
          }
        }
} as const
