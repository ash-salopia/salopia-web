// ============================================================
// Branding types
// ============================================================

export type OrgTier = 'standard' | 'premium';

export interface OrgBranding {
  brand_name?: string;       // premium: replaces "AthletiQ"
  logo_url?: string;         // premium: logo image URL
  primary_color?: string;    // both: hex accent colour
  primary_color_dim?: string;// both: dim version for backgrounds
  show_powered_by?: boolean; // premium: show "Powered by AthletiQ" footer
}

export interface OrgWithBranding {
  id: string;
  name: string;
  tier: OrgTier;
  branding: OrgBranding;
}

// Resolved branding — what the UI actually uses
export interface ResolvedBranding {
  // Display name in header
  displayName: string;         // premium: brand_name; standard: "AthletiQ"
  showOrgName: boolean;        // standard: true (shows "AthletiQ · OrgName"); premium: false
  logoUrl: string | null;      // premium only
  primaryColor: string;        // hex
  primaryColorDim: string;     // hex — for button backgrounds etc.
  isPremium: boolean;
  showPoweredBy: boolean;      // premium: optional footer credit
}

export const DEFAULT_BRANDING: ResolvedBranding = {
  displayName: "AthletiQ",
  showOrgName: true,
  logoUrl: null,
  primaryColor: "#00d4ff",
  primaryColorDim: "#002233",
  isPremium: false,
  showPoweredBy: false,
};

export function resolveBranding(
  org: { name: string; tier: OrgTier; branding: OrgBranding }
): ResolvedBranding {
  const isPremium = org.tier === 'premium';
  const b = org.branding ?? {};

  return {
    displayName: isPremium && b.brand_name ? b.brand_name : "AthletiQ",
    showOrgName: !isPremium,
    logoUrl: isPremium ? (b.logo_url ?? null) : null,
    primaryColor: b.primary_color ?? DEFAULT_BRANDING.primaryColor,
    primaryColorDim: b.primary_color_dim ?? DEFAULT_BRANDING.primaryColorDim,
    isPremium,
    showPoweredBy: isPremium ? (b.show_powered_by ?? false) : false,
  };
}
