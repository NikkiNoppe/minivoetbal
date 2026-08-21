import {
  applyReglementOverrides,
  resolveReglementCopy,
  type ReglementCopy,
  type ReglementOverrides,
} from '@/config/reglement';

/** Publieke paginateksten per organisatie (override via organizations.branding_settings.content). */

export interface FooterContactPerson {
  name: string;
  phone?: string;
  email?: string;
}

export interface AlgemeenPageCopy {
  title: string;
  subtitle: string;
  aboutParagraph: string;
}

export interface ProfileFinancialCopy {
  seasonDepositTarget: number;
  depositDeadlineLabel: string;
  accountHolder: string;
  iban: string;
  seasonDepositNotice: string;
}

export interface OrganizationPublicContent {
  algemeen: AlgemeenPageCopy;
  footerTagline: string;
  footerContacts: FooterContactPerson[];
  profileFinancial: ProfileFinancialCopy;
  reglement: ReglementCopy;
}

const HARELBEKE_FOOTER_CONTACTS: FooterContactPerson[] = [
  {
    name: 'Nikki Noppe',
    phone: '+32 468 15 52 16',
    email: 'noppe.nikki@icloud.com',
  },
  {
    name: 'Wesley Dedeurwaerder',
    phone: '+32 472 56 80 49',
  },
  {
    name: 'Hans Reynaert',
    phone: '+32 470 90 20 27',
  },
];

export const ORGANIZATION_PUBLIC_CONTENT: Record<string, OrganizationPublicContent> = {
  harelbeke: {
    algemeen: {
      title: 'Minivoetbal Harelbeke',
      subtitle: 'De officiële minivoetbalcompetitie van Harelbeke en Bavikhove sinds 1979',
      aboutParagraph:
        'Opgericht in 1979 is de Harelbeekse Minivoetbal Competitie uitgegroeid tot de grootste minivoetbalcompetitie van Harelbeke. Elk seizoen nemen tal van teams uit Harelbeke en omgeving deel.',
    },
    footerTagline: 'Minivoetbalcompetitie sinds 1979.',
    footerContacts: HARELBEKE_FOOTER_CONTACTS,
    profileFinancial: {
      seasonDepositTarget: 600,
      depositDeadlineLabel: '15 augustus',
      accountHolder: 'Nikki Noppe',
      iban: 'BE48 6504 6890 7727',
      seasonDepositNotice: '',
    },
    reglement: resolveReglementCopy('harelbeke'),
  },
  kuurne: {
    algemeen: {
      title: 'Minivoetbal Vereniging Kuurne',
      subtitle: 'Standen, speelschema en uitslagen in Kuurne sinds 1981',
      aboutParagraph:
        'Opgericht in 1981 bevordert Minivoetbal Vereniging Kuurne minivoetbal in een sportieve competitie, met fairplay voorop. Op deze site vind je het actuele speelschema, klassementen, uitslagen en het algemeen reglement.',
    },
    footerTagline: 'Minivoetbalcompetitie sinds 1981.',
    footerContacts: [],
    profileFinancial: {
      seasonDepositTarget: 600,
      depositDeadlineLabel: '15 augustus',
      accountHolder: '',
      iban: '',
      seasonDepositNotice:
        'Neem contact op met de organisatie voor stortingsgegevens.',
    },
    reglement: resolveReglementCopy('kuurne'),
  },
};

function mergeAlgemeenCopy(
  base: AlgemeenPageCopy,
  override?: Partial<AlgemeenPageCopy>,
): AlgemeenPageCopy {
  return {
    title: override?.title?.trim() || base.title,
    subtitle: override?.subtitle?.trim() || base.subtitle,
    aboutParagraph: override?.aboutParagraph?.trim() || base.aboutParagraph,
  };
}

function mergeProfileFinancialCopy(
  base: ProfileFinancialCopy,
  override?: Partial<ProfileFinancialCopy>,
): ProfileFinancialCopy {
  return {
    seasonDepositTarget:
      override?.seasonDepositTarget ?? base.seasonDepositTarget,
    depositDeadlineLabel:
      override?.depositDeadlineLabel?.trim() || base.depositDeadlineLabel,
    accountHolder: override?.accountHolder?.trim() || base.accountHolder,
    iban: override?.iban?.trim() || base.iban,
    seasonDepositNotice:
      override?.seasonDepositNotice?.trim() || base.seasonDepositNotice,
  };
}

function mergeFooterContacts(
  base: FooterContactPerson[],
  override?: FooterContactPerson[],
): FooterContactPerson[] {
  if (!override) {
    return base;
  }

  return override
    .map((contact) => ({
      name: contact.name?.trim() ?? '',
      phone: contact.phone?.trim() ?? '',
      email: contact.email?.trim() ?? '',
    }))
    .filter((contact) => contact.name);
}

export function phoneToTelHref(phone: string): string {
  const normalized = phone.replace(/\s/g, '');
  return normalized ? `tel:${normalized}` : '';
}

export function resolveOrganizationPublicContent(
  slug: string,
  brandingSettings?: Record<string, unknown>,
): OrganizationPublicContent {
  const base =
    ORGANIZATION_PUBLIC_CONTENT[slug] ?? ORGANIZATION_PUBLIC_CONTENT.harelbeke;

  const raw = brandingSettings?.content as
    | {
        algemeen?: Partial<AlgemeenPageCopy>;
        footerTagline?: string;
        footerContacts?: FooterContactPerson[];
        profileFinancial?: Partial<ProfileFinancialCopy>;
        reglement?: ReglementOverrides;
      }
    | undefined;

  if (!raw) {
    return base;
  }

  return {
    algemeen: mergeAlgemeenCopy(base.algemeen, raw.algemeen),
    footerTagline: raw.footerTagline?.trim() || base.footerTagline,
    footerContacts: mergeFooterContacts(base.footerContacts, raw.footerContacts),
    profileFinancial: mergeProfileFinancialCopy(
      base.profileFinancial,
      raw.profileFinancial,
    ),
    reglement: applyReglementOverrides(base.reglement, raw.reglement),
  };
}
