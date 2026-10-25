export interface ApprovedOlistCategoryPhoto {
  path: string;
  creator: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  sha256: string;
  sourceImageSha256: string;
  pHashDistance: number;
  dHashDistance: number;
  provenanceStatus: "VERIFIED_IMAGE_CONTENT_MATCH";
  reviewStatus: "approved";
}

interface VerifiedPexelsPhoto {
  creator: string;
  sourceUrl: string;
  sha256: string;
  sourceImageSha256: string;
  pHashDistance: number;
  dHashDistance: number;
}

const verifiedPexelsPhotos: Record<string, VerifiedPexelsPhoto> = {
  "212269": { creator: "Jaymantri", sourceUrl: "https://www.pexels.com/photo/white-bed-comforter-212269/", sha256: "d0f0ce071535989c10fc83489ff6caf8e18d9701f6b060dfc1dcca56727b9123", sourceImageSha256: "920566b6514442bb75f1f9368ee5136d919d2401a5f688e87ddfad59f175f9cc", pHashDistance: 0, dHashDistance: 0 },
  "36156260": { creator: "Florencia Pérez", sourceUrl: "https://www.pexels.com/photo/tennis-racket-and-balls-in-studio-setup-36156260/", sha256: "536413683683ae242ea8ee3d8d8ccd7466ad2380620156f5ff86dd807a79f686", sourceImageSha256: "81295ec594c64fdcd2cab64d60f7182037c3c79ecae44750b46222124b284e09", pHashDistance: 0, dHashDistance: 0 },
  "15028227": { creator: "Vural Yavas", sourceUrl: "https://www.pexels.com/photo/decorative-vase-on-black-background-15028227/", sha256: "a61752c91c4e3f401b99cb1f81acb15e8017bab788f7d5249706a0ceb587aa14", sourceImageSha256: "aa39fcefd09e4452122686cd5e4937db64d0b9cdc2df6da12e9a9e776d24e3a6", pHashDistance: 0, dHashDistance: 1 },
  "16378446": { creator: "mearlywan", sourceUrl: "https://www.pexels.com/photo/pump-bottles-with-skincare-products-16378446/", sha256: "c63486932b893328f0a635b008dc4e783737f20b0e3549bfdee20fd21e92a2bd", sourceImageSha256: "5f91490ef243d8e2cd0e4779be7a153a0068b06660a915940997639ba1966889", pHashDistance: 2, dHashDistance: 0 },
  "1809127": { creator: "Andrea Piacquadio", sourceUrl: "https://www.pexels.com/photo/close-up-photo-of-cup-1809127/", sha256: "1ad87382bbfcaf2362f7cb01d055908efe063577685e4ef28a500246102c5c73", sourceImageSha256: "c503a01bf9d3414a3c4cc971bf12007ac4d8abf539e376e9ce4be673e3ba6462", pHashDistance: 0, dHashDistance: 0 },
  "13870516": { creator: "Matheus Bertelli", sourceUrl: "https://www.pexels.com/photo/photograph-of-a-black-wireless-mouse-13870516/", sha256: "74d9c3a55144fdde97c1e9c6a709e11ee5da80cd8fe75a7efb2f0430aba47d99", sourceImageSha256: "daa4df1a00f47a46143a9d0ca16d61f61edb3c6f1d09682524265b9073c1e22e", pHashDistance: 2, dHashDistance: 1 },
  "15107945": { creator: "Nathan J Hilton", sourceUrl: "https://www.pexels.com/photo/close-up-of-a-black-mens-wristwatch-in-a-box-15107945/", sha256: "b06ab1e8ad68d334ca613e05c443d7792664cb4432c27bcff2bfb46768d7e806", sourceImageSha256: "75249e68befecf04097ce3eeb8a5a2a95a56cba7d86a9f2742973e477fa8f1c8", pHashDistance: 2, dHashDistance: 0 },
  "18386860": { creator: "Amar Preciado", sourceUrl: "https://www.pexels.com/photo/smartphones-on-red-flat-lay-18386860/", sha256: "39bbb2e01fd10bb389d33c79ddafbbc3633ca851ad1a282f280f9f14544ce51f", sourceImageSha256: "2d4f37075a89dfc744e3b3ad7573d68648d51c7fe43f83d0877115bfcfb2316b", pHashDistance: 0, dHashDistance: 1 },
  "29805437": { creator: "PIC MATTI", sourceUrl: "https://www.pexels.com/photo/elegant-black-perfume-bottle-on-a-dark-background-29805437/", sha256: "5f8272dfc20419ddf0d3752477ab596d6e9a20a76e155743ae290e137d038857", sourceImageSha256: "1b234f7eee0e3cb86cb155a6b7f72b7fecbf5ac7bcf6bbc5e09c1c51443e23f7", pHashDistance: 0, dHashDistance: 1 },
  "7085799": { creator: "Emil Kalibradov", sourceUrl: "https://www.pexels.com/photo/close-up-shot-of-black-wallets-on-a-wooden-surface-7085799/", sha256: "61a0dc2f4de529f0257feac6f5c99ee8d6a5678ec9931a12404f76716b26b108", sourceImageSha256: "d4ddd30a9e601f8415fa2d5f040f251850881672bfa158c08ba43031e519bd2e", pHashDistance: 2, dHashDistance: 0 },
  "9507250": { creator: "ROCKETMANN TEAM", sourceUrl: "https://www.pexels.com/photo/black-and-silver-hand-tool-9507250/", sha256: "edc56c6234ee6c521f74d4b872cfd541ca67b2966ec8a5da1bc1291d22313af5", sourceImageSha256: "abea7b8e203d021d7ac6e3edc076b076bb15038be2f83966340b213c004211b2", pHashDistance: 2, dHashDistance: 0 },
  "8811529": { creator: "Jonathan Cooper", sourceUrl: "https://www.pexels.com/photo/close-up-shot-of-a-cordless-hand-drill-8811529/", sha256: "1486bc1635ede446dc1d55683477bef319e61d75dfa7d5dfde33a91007231eed", sourceImageSha256: "e7b7e4570a00f5068bf750577089ce8b2dfed2317edb829177edf75eddf5eb80", pHashDistance: 0, dHashDistance: 0 },
  "12167650": { creator: "Vedat Öncelik", sourceUrl: "https://www.pexels.com/photo/close-up-of-the-handle-of-a-cordless-vacuum-cleaner-12167650/", sha256: "5bed933ba086708894d5db92cfca48dd44abc894e5e5e36c7a05a9abd9cc964a", sourceImageSha256: "57f9b8b9b837883cf77638a5c7e524b2c791d6a31967f5c6c3f2ed1e74a0b65d", pHashDistance: 0, dHashDistance: 0 },
  "13870707": { creator: "Matheus Bertelli", sourceUrl: "https://www.pexels.com/photo/blue-backpack-on-the-ground-13870707/", sha256: "6488811fcf2e64dbc14415f7806c17911919246c6d8e5438cfd1fb0ad2f08bdb", sourceImageSha256: "36143c180b66ff70d4fcadbc64368227b4972a185511145af6f3a9a5342825e5", pHashDistance: 0, dHashDistance: 1 },
  "4522995": { creator: "Polina Tankilevitch", sourceUrl: "https://www.pexels.com/photo/platystation-controllers-on-a-white-surface-near-black-box-4522995/", sha256: "f0b5c1e4d73f1b462edb5d82c2a1cb016b26e80851101c2fa8dee669608f327e", sourceImageSha256: "2e83f218d4b72986b8ce6673caf1f8a2d851befd325e4f887250f95bf85c7764", pHashDistance: 2, dHashDistance: 0 },
  "10965752": { creator: "Engin Akyurt", sourceUrl: "https://www.pexels.com/photo/glass-electric-kettle-in-close-up-shot-10965752/", sha256: "b5f18c8493990e2b0ad1baf7604973cbf50357125023c740f587b6561647e197", sourceImageSha256: "5ff8d8a44ddb23eb67a8118e1d784335f007ddcc4511f6e9addf4dfc42ca8a63", pHashDistance: 0, dHashDistance: 0 },
  "684152": { creator: "Athul Adhu", sourceUrl: "https://www.pexels.com/photo/pair-of-black-and-gray-adidas-low-top-sneakers-with-box-684152/", sha256: "ce5d780941c9f287d1751cacd34b101a40fe89860c8c2e7474c2e268b3fa181c", sourceImageSha256: "a577dbcd93c0a3331830175b74ab1d6d769b589c19b521f3e319daec91ab3e81", pHashDistance: 0, dHashDistance: 0 },
  "30731004": { creator: "Airam Dato-on", sourceUrl: "https://www.pexels.com/photo/chilled-pocari-sweat-bottles-on-ice-30731004/", sha256: "f1697b307c3d85f2df127b21fe38725bfcf2e9df7e061dfb979a06d8112772e1", sourceImageSha256: "f46554ead25125bf7fcbbfc4f7d25a1d43a5cce1b34418c982a8763dba24a259", pHashDistance: 2, dHashDistance: 1 },
  "2919003": { creator: "Jessica Lewis 🦋 thepaintedsquare", sourceUrl: "https://www.pexels.com/photo/black-headphone-2919003/", sha256: "aefab996fd8af81df3adef782e67df9d039ca3d095fda895aed9a159d9b3e5d8", sourceImageSha256: "fb5f0ed521ea1e490c6661b324ccb176af774d7c1bca9f6945db14002b321550", pHashDistance: 0, dHashDistance: 1 },
  "5974048": { creator: "Ono Kosuki", sourceUrl: "https://www.pexels.com/photo/modern-convenient-screwdriver-drill-among-tools-for-carpentry-5974048/", sha256: "b61cb039462fe7de18ada4cfe22078fc0f5bac1b8c95ab1e6dd3cfe4cd7b8103", sourceImageSha256: "a5161b7527a640e40e06810ac6860c20c08602953feaa32d7379d642bbdad4f0", pHashDistance: 2, dHashDistance: 0 },
  "8534378": { creator: "Hanna Pad", sourceUrl: "https://www.pexels.com/photo/apple-macbook-on-small-white-desk-8534378/", sha256: "ab525ea09d35c3113084269bc05433e5a7142b77f9b07fb48b82b00bf3a2a03c", sourceImageSha256: "a7d9a0062874a994197ca2981c9dd9ed0ab3353448abf9151a5be71d01473b65", pHashDistance: 0, dHashDistance: 3 },
  "7789218": { creator: "Ivan Babydov", sourceUrl: "https://www.pexels.com/photo/canon-eos-rp-7789218/", sha256: "b77e3309462ca7d264367133473f552ef4dc40236bfb96c3eb0e0dbef2df7efc", sourceImageSha256: "a42fb7f275361e90b64c95687c983e3ea74b42350d6ecfdc337e3e6182b23cd9", pHashDistance: 0, dHashDistance: 1 },
};

const approvedPhotoIdsByCategory: Record<string, string> = {
  bed_bath_table: "212269",
  sports_leisure: "36156260",
  furniture_decor: "15028227",
  health_beauty: "16378446",
  housewares: "1809127",
  computers_accessories: "13870516",
  watches_gifts: "15107945",
  telephony: "18386860",
  perfumery: "29805437",
  fashion_bags_accessories: "7085799",
  garden_tools: "9507250",
  construction_tools_construction: "8811529",
  home_appliances: "12167650",
  luggage_accessories: "13870707",
  consoles_games: "4522995",
  small_appliances: "10965752",
  fashion_shoes: "684152",
  costruction_tools_garden: "9507250",
  drinks: "30731004",
  audio: "2919003",
  costruction_tools_tools: "5974048",
  computers: "8534378",
  cine_photo: "7789218",
  fashion_sport: "684152",
};

export const APPROVED_OLIST_CATEGORY_PHOTOS: Partial<Record<string, ApprovedOlistCategoryPhoto>> =
  Object.fromEntries(Object.entries(approvedPhotoIdsByCategory).map(([categoryKey, id]) => {
    const photo = verifiedPexelsPhotos[id];
    if (!photo) throw new Error(`Approved category ${categoryKey} has no verified Pexels source: ${id}`);
    return [categoryKey, {
      path: `/images/products/pexels-${id}.jpg`,
      creator: photo.creator,
      sourceUrl: photo.sourceUrl,
      license: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
      attribution: `Photo by ${photo.creator} on Pexels (source page: ${photo.sourceUrl}).`,
      sha256: photo.sha256,
      sourceImageSha256: photo.sourceImageSha256,
      pHashDistance: photo.pHashDistance,
      dHashDistance: photo.dHashDistance,
      provenanceStatus: "VERIFIED_IMAGE_CONTENT_MATCH" as const,
      reviewStatus: "approved" as const,
    }];
  }));
