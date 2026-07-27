import { ProEditionError } from "@/lib/errors";
import type {
  AssetKind,
  AssetVariant,
  ColorUpdate,
  GlobalBrandingDto,
} from "./branding.service";

// Branding mutation stub: color/asset writes require the Pro edition and refuse with a 403 that the
// client turns into an upgrade prompt. Reads (getGlobalBranding/readBrandingAsset) stay public and
// live in branding.service, so the default fazer.ai identity still renders in the Free edition.

export async function updateBrandingColors(
  _input: ColorUpdate,
): Promise<GlobalBrandingDto> {
  throw new ProEditionError();
}

export async function setBrandingAsset(
  _kind: AssetKind,
  _variant: AssetVariant,
  _file: {
    type: string;
    size: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
  },
): Promise<GlobalBrandingDto> {
  throw new ProEditionError();
}

export async function clearBrandingAsset(
  _kind: AssetKind,
  _variant: AssetVariant,
): Promise<GlobalBrandingDto> {
  throw new ProEditionError();
}
