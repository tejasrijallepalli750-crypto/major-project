import {
  APPROVED_OLIST_CATEGORY_PHOTOS,
  type ApprovedOlistCategoryPhoto,
} from "./approvedOlistCategoryPhotos";

export type CategoryIllustrationFamily =
  | 'accessories'
  | 'automotive'
  | 'beauty'
  | 'food'
  | 'garden'
  | 'general'
  | 'home'
  | 'sports'
  | 'stationery'
  | 'technology'
  | 'toys';

export interface OlistCategoryImageDefinition {
  sourceCategory: string;
  categoryKey: string;
  illustrationFamily: CategoryIllustrationFamily;
  approvedPhoto?: ApprovedOlistCategoryPhoto;
}

const categoryDefinitions: readonly OlistCategoryImageDefinition[] = [
  { sourceCategory: 'agro_industria_e_comercio', categoryKey: 'agro_industry_and_commerce', illustrationFamily: 'garden' },
  { sourceCategory: 'alimentos', categoryKey: 'food', illustrationFamily: 'food' },
  { sourceCategory: 'alimentos_bebidas', categoryKey: 'food_drink', illustrationFamily: 'food' },
  { sourceCategory: 'artes', categoryKey: 'art', illustrationFamily: 'general' },
  { sourceCategory: 'artes_e_artesanato', categoryKey: 'arts_and_craftmanship', illustrationFamily: 'general' },
  { sourceCategory: 'artigos_de_festas', categoryKey: 'party_supplies', illustrationFamily: 'general' },
  { sourceCategory: 'artigos_de_natal', categoryKey: 'christmas_supplies', illustrationFamily: 'general' },
  { sourceCategory: 'audio', categoryKey: 'audio', illustrationFamily: 'technology' },
  { sourceCategory: 'automotivo', categoryKey: 'auto', illustrationFamily: 'automotive' },
  { sourceCategory: 'bebes', categoryKey: 'baby', illustrationFamily: 'toys' },
  { sourceCategory: 'bebidas', categoryKey: 'drinks', illustrationFamily: 'food' },
  { sourceCategory: 'beleza_saude', categoryKey: 'health_beauty', illustrationFamily: 'beauty' },
  { sourceCategory: 'brinquedos', categoryKey: 'toys', illustrationFamily: 'toys' },
  { sourceCategory: 'cama_mesa_banho', categoryKey: 'bed_bath_table', illustrationFamily: 'home' },
  { sourceCategory: 'casa_conforto', categoryKey: 'home_confort', illustrationFamily: 'home' },
  { sourceCategory: 'casa_conforto_2', categoryKey: 'home_comfort_2', illustrationFamily: 'home' },
  { sourceCategory: 'casa_construcao', categoryKey: 'home_construction', illustrationFamily: 'garden' },
  { sourceCategory: 'cds_dvds_musicais', categoryKey: 'cds_dvds_musicals', illustrationFamily: 'technology' },
  { sourceCategory: 'cine_foto', categoryKey: 'cine_photo', illustrationFamily: 'technology' },
  { sourceCategory: 'climatizacao', categoryKey: 'air_conditioning', illustrationFamily: 'home' },
  { sourceCategory: 'consoles_games', categoryKey: 'consoles_games', illustrationFamily: 'technology' },
  { sourceCategory: 'construcao_ferramentas_construcao', categoryKey: 'construction_tools_construction', illustrationFamily: 'garden' },
  { sourceCategory: 'construcao_ferramentas_ferramentas', categoryKey: 'costruction_tools_tools', illustrationFamily: 'garden' },
  { sourceCategory: 'construcao_ferramentas_iluminacao', categoryKey: 'construction_tools_lights', illustrationFamily: 'home' },
  { sourceCategory: 'construcao_ferramentas_jardim', categoryKey: 'costruction_tools_garden', illustrationFamily: 'garden' },
  { sourceCategory: 'construcao_ferramentas_seguranca', categoryKey: 'construction_tools_safety', illustrationFamily: 'garden' },
  { sourceCategory: 'cool_stuff', categoryKey: 'cool_stuff', illustrationFamily: 'general' },
  { sourceCategory: 'dvds_blu_ray', categoryKey: 'dvds_blu_ray', illustrationFamily: 'technology' },
  { sourceCategory: 'eletrodomesticos', categoryKey: 'home_appliances', illustrationFamily: 'home' },
  { sourceCategory: 'eletrodomesticos_2', categoryKey: 'home_appliances_2', illustrationFamily: 'home' },
  { sourceCategory: 'eletronicos', categoryKey: 'electronics', illustrationFamily: 'technology' },
  { sourceCategory: 'eletroportateis', categoryKey: 'small_appliances', illustrationFamily: 'home' },
  { sourceCategory: 'esporte_lazer', categoryKey: 'sports_leisure', illustrationFamily: 'sports' },
  { sourceCategory: 'fashion_bolsas_e_acessorios', categoryKey: 'fashion_bags_accessories', illustrationFamily: 'accessories' },
  { sourceCategory: 'fashion_calcados', categoryKey: 'fashion_shoes', illustrationFamily: 'accessories' },
  { sourceCategory: 'fashion_esporte', categoryKey: 'fashion_sport', illustrationFamily: 'accessories' },
  { sourceCategory: 'fashion_roupa_feminina', categoryKey: 'fashio_female_clothing', illustrationFamily: 'accessories' },
  { sourceCategory: 'fashion_roupa_infanto_juvenil', categoryKey: 'fashion_childrens_clothes', illustrationFamily: 'accessories' },
  { sourceCategory: 'fashion_roupa_masculina', categoryKey: 'fashion_male_clothing', illustrationFamily: 'accessories' },
  { sourceCategory: 'fashion_underwear_e_moda_praia', categoryKey: 'fashion_underwear_beach', illustrationFamily: 'accessories' },
  { sourceCategory: 'ferramentas_jardim', categoryKey: 'garden_tools', illustrationFamily: 'garden' },
  { sourceCategory: 'flores', categoryKey: 'flowers', illustrationFamily: 'garden' },
  { sourceCategory: 'fraldas_higiene', categoryKey: 'diapers_and_hygiene', illustrationFamily: 'beauty' },
  { sourceCategory: 'industria_comercio_e_negocios', categoryKey: 'industry_commerce_and_business', illustrationFamily: 'general' },
  { sourceCategory: 'informatica_acessorios', categoryKey: 'computers_accessories', illustrationFamily: 'technology' },
  { sourceCategory: 'instrumentos_musicais', categoryKey: 'musical_instruments', illustrationFamily: 'technology' },
  { sourceCategory: 'la_cuisine', categoryKey: 'la_cuisine', illustrationFamily: 'home' },
  { sourceCategory: 'livros_importados', categoryKey: 'books_imported', illustrationFamily: 'stationery' },
  { sourceCategory: 'livros_interesse_geral', categoryKey: 'books_general_interest', illustrationFamily: 'stationery' },
  { sourceCategory: 'livros_tecnicos', categoryKey: 'books_technical', illustrationFamily: 'stationery' },
  { sourceCategory: 'malas_acessorios', categoryKey: 'luggage_accessories', illustrationFamily: 'accessories' },
  { sourceCategory: 'market_place', categoryKey: 'market_place', illustrationFamily: 'general' },
  { sourceCategory: 'moveis_colchao_e_estofado', categoryKey: 'furniture_mattress_and_upholstery', illustrationFamily: 'home' },
  { sourceCategory: 'moveis_cozinha_area_de_servico_jantar_e_jardim', categoryKey: 'kitchen_dining_laundry_garden_furniture', illustrationFamily: 'home' },
  { sourceCategory: 'moveis_decoracao', categoryKey: 'furniture_decor', illustrationFamily: 'home' },
  { sourceCategory: 'moveis_escritorio', categoryKey: 'office_furniture', illustrationFamily: 'home' },
  { sourceCategory: 'moveis_quarto', categoryKey: 'furniture_bedroom', illustrationFamily: 'home' },
  { sourceCategory: 'moveis_sala', categoryKey: 'furniture_living_room', illustrationFamily: 'home' },
  { sourceCategory: 'musica', categoryKey: 'music', illustrationFamily: 'technology' },
  { sourceCategory: 'papelaria', categoryKey: 'stationery', illustrationFamily: 'stationery' },
  { sourceCategory: 'pc_gamer', categoryKey: 'pc_gamer', illustrationFamily: 'technology' },
  { sourceCategory: 'pcs', categoryKey: 'computers', illustrationFamily: 'technology' },
  { sourceCategory: 'perfumaria', categoryKey: 'perfumery', illustrationFamily: 'beauty' },
  { sourceCategory: 'pet_shop', categoryKey: 'pet_shop', illustrationFamily: 'general' },
  { sourceCategory: 'portateis_casa_forno_e_cafe', categoryKey: 'small_appliances_home_oven_and_coffee', illustrationFamily: 'home' },
  { sourceCategory: 'portateis_cozinha_e_preparadores_de_alimentos', categoryKey: 'portateis_cozinha_e_preparadores_de_alimentos', illustrationFamily: 'home' },
  { sourceCategory: 'relogios_presentes', categoryKey: 'watches_gifts', illustrationFamily: 'accessories' },
  { sourceCategory: 'seguros_e_servicos', categoryKey: 'security_and_services', illustrationFamily: 'general' },
  { sourceCategory: 'sinalizacao_e_seguranca', categoryKey: 'signaling_and_security', illustrationFamily: 'general' },
  { sourceCategory: 'tablets_impressao_imagem', categoryKey: 'tablets_printing_image', illustrationFamily: 'technology' },
  { sourceCategory: 'telefonia', categoryKey: 'telephony', illustrationFamily: 'technology' },
  { sourceCategory: 'telefonia_fixa', categoryKey: 'fixed_telephony', illustrationFamily: 'technology' },
  { sourceCategory: 'utilidades_domesticas', categoryKey: 'housewares', illustrationFamily: 'home' },
  { sourceCategory: '', categoryKey: 'uncategorized', illustrationFamily: 'general' },
];

export const OLIST_CATEGORY_IMAGE_MAP: readonly OlistCategoryImageDefinition[] = categoryDefinitions.map(
  (definition) => {
    const approvedPhoto = APPROVED_OLIST_CATEGORY_PHOTOS[definition.categoryKey];
    return approvedPhoto ? { ...definition, approvedPhoto } : definition;
  },
);
