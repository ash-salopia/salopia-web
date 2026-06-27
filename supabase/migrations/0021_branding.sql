-- ============================================================
-- 0021_branding.sql
-- Two-tier branding system
-- Standard: AthletiQ branding + org name + accent colour
-- Premium:  Full white-label — custom name, logo, colours
-- ============================================================

-- Add tier and branding to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS tier text not null default 'standard'
    check (tier in ('standard', 'premium')),
  ADD COLUMN IF NOT EXISTS branding jsonb not null default '{}';

-- branding JSONB shape:
-- {
--   "brand_name":              string,   -- premium: replaces "AthletiQ"; standard: ignored
--   "logo_url":                string,   -- premium: URL to logo image in storage
--   "primary_color":           string,   -- both: hex e.g. "#00d4ff" — overrides default accent
--   "primary_color_dim":       string,   -- both: dimmed version for backgrounds
--   "show_powered_by":         boolean,  -- premium: show "Powered by AthletiQ" footer
-- }

-- Storage bucket for logos (run separately in Supabase dashboard if needed)
-- insert into storage.buckets (id, name, public) values ('org-logos', 'org-logos', true)
-- on conflict do nothing;

COMMENT ON COLUMN organisations.tier IS 'standard = AthletiQ branded; premium = white-label';
COMMENT ON COLUMN organisations.branding IS 'JSON branding config: brand_name, logo_url, primary_color, primary_color_dim, show_powered_by';
