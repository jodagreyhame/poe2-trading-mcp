/**
 * TypeScript interfaces for POE2Official Trade API
 * 
 * Comprehensive type definitions for trade search and fetch operations.
 */

/**
 * Trade search parameters
 */
export interface TradeSearchParams {
  league: string;
  query?: TradeSearchQuery;
  exchange?: TradeExchangeQuery;
  limit?: number;
}

/**
 * Item search query structure
 */
export interface TradeSearchQuery {
  status?: {
    option?: 'online' | 'any';
  };
  term?: string;
  type?: string;
  stats?: Array<{
    type: 'and' | 'not' | 'count' | 'weight';
    filters: Array<{
      id: string;
      value?: {
        min?: number;
        max?: number;
        option?: number;
      };
      disabled?: boolean;
    }>;
    min?: number;
    max?: number;
  }>;
  filters?: {
    type_filters?: {
      filters?: {
        category?: {
          option?: string;
        };
        rarity?: {
          option?: 'normal' | 'magic' | 'rare' | 'unique';
        };
      };
    };
    socket_filters?: {
      filters?: {
        sockets?: {
          min?: number;
          max?: number;
          r?: number;
          g?: number;
          b?: number;
          w?: number;
        };
        links?: {
          min?: number;
          max?: number;
        };
      };
    };
    req_filters?: {
      filters?: {
        lvl?: {
          min?: number;
          max?: number;
        };
        str?: {
          min?: number;
          max?: number;
        };
        dex?: {
          min?: number;
          max?: number;
        };
        int?: {
          min?: number;
          max?: number;
        };
      };
    };
    misc_filters?: {
      filters?: {
        quality?: {
          min?: number;
          max?: number;
        };
        ilvl?: {
          min?: number;
          max?: number;
        };
        corrupted?: {
          option?: boolean;
        };
        identified?: {
          option?: boolean;
        };
        crafted?: {
          option?: boolean;
        };
        enchanted?: {
          option?: boolean;
        };
      };
    };
    trade_filters?: {
      filters?: {
        account?: {
          input?: string;
        };
        price?: {
          min?: number;
          max?: number;
          option?: string;
        };
        indexed?: {
          option?: '1day' | '3days' | '1week' | '2weeks' | '1month' | '2months';
        };
      };
    };
  };
}

/**
 * Currency exchange query structure
 */
export interface TradeExchangeQuery {
  status?: {
    option?: 'online' | 'any';
  };
  have: string[];
  want: string[];
  minimum?: number;
  collapse?: boolean;
  account?: {
    input?: string;
  };
}

/**
 * Trade search response
 */
export interface TradeSearchResponse {
  id: string;
  complexity: number | null;
  result: string[];
  total: number;
  inexact: boolean;
  cached: boolean;
}

/**
 * Trade fetch parameters
 */
export interface TradeFetchParams {
  searchId: string;
  itemIds: string[];
  exchange?: boolean;
}

/**
 * Trade fetch response
 */
export interface TradeFetchResponse {
  result: TradeItem[];
  cached: boolean;
}

/**
 * Trade item structure
 */
export interface TradeItem {
  id: string;
  listing: TradeListing;
  item: ItemDetails;
}

/**
 * Trade listing information
 */
export interface TradeListing {
  method?: string;
  indexed?: string;
  stash?: {
    name: string;
    x: number;
    y: number;
  };
  whisper?: string;
  account: {
    name: string;
    lastCharacterName?: string;
    online?: {
      league?: string;
      status?: string;
    };
    language?: string;
  };
  price?: {
    type: 'simple' | 'bulk';
    amount: number;
    currency: string;
    exchange?: {
      amount: number;
      currency: string;
    };
  } | undefined;
}

/**
 * Item details structure
 */
export interface ItemDetails {
  verified: boolean;
  w: number;
  h: number;
  icon: string;
  league?: string;
  id?: string;
  name?: string;
  typeLine: string;
  baseType?: string;
  identified: boolean;
  ilvl: number;
  note?: string;
  forum_note?: string;
  properties?: Array<{
    name: string;
    values: Array<[string, number]>;
    displayMode: number;
    type?: number;
  }>;
  notableProperties?: Array<{
    name: string;
    values: Array<[string, number]>;
    displayMode: number;
  }>;
  requirements?: Array<{
    name: string;
    values: Array<[string, number]>;
    displayMode: number;
  }>;
  implicitMods?: string[];
  explicitMods?: string[];
  craftedMods?: string[];
  enchantMods?: string[];
  fracturedMods?: string[];
  utilityMods?: string[];
  descrText?: string;
  flavourText?: string[];
  frameType: number;
  corrupted?: boolean;
  influences?: {
    elder?: boolean;
    shaper?: boolean;
    searing?: boolean;
    tangled?: boolean;
    warlord?: boolean;
    crusader?: boolean;
    hunter?: boolean;
    redeemer?: boolean;
  };
  sockets?: Array<{
    group: number;
    attr?: string;
    sColour?: string;
  }>;
  socketedItems?: ItemDetails[];
  incubatedItem?: {
    name: string;
    level: number;
    progress: number;
    total: number;
  };
  hybrid?: {
    isVaalGem?: boolean;
    baseTypeName?: string;
    properties?: any[];
    explicitMods?: string[];
    secDescrText?: string;
  };
  extended?: {
    category?: string;
    subcategories?: string[];
    prefixes?: number;
    suffixes?: number;
    text?: string;
    mods?: Record<string, any>;
    hashes?: Record<string, any>;
  };
}

/**
 * Currency type mappings
 */
export const CurrencyTypes: Record<string, string> = {
  // Basic currency
  'chaos': 'chaos',
  'divine': 'divine',
  'exalted': 'exalted',
  'mirror': 'mirror',
  'ancient': 'ancient',
  'annul': 'annul',
  'blessed': 'blessed',
  'chance': 'chance',
  'chisel': 'chisel',
  'chromatic': 'chromatic',
  'gemcutter': 'gemcutter',
  'jeweller': 'jeweller',
  'orb-of-alchemy': 'alch',
  'orb-of-alteration': 'alt',
  'orb-of-augmentation': 'aug',
  'orb-of-binding': 'binding',
  'orb-of-fusing': 'fuse',
  'orb-of-regret': 'regret',
  'orb-of-scouring': 'scour',
  'orb-of-transmutation': 'transmute',
  'portal': 'portal',
  'regal': 'regal',
  'silver': 'silver',
  'vaal': 'vaal',
  'wisdom': 'wisdom',
  
  // Special currency
  'perandus': 'perandus',
  'harbinger': 'harbinger',
  'horizon': 'horizon',
  'engineers': 'engineers',
  'ancient-shard': 'ancient-shard',
  'chaos-shard': 'chaos-shard',
  'mirror-shard': 'mirror-shard',
  'exalted-shard': 'exalted-shard',
  'binding-shard': 'binding-shard',
  'horizon-shard': 'horizon-shard',
  'harbinger-shard': 'harbinger-shard',
  'engineers-shard': 'engineers-shard',
  'regal-shard': 'regal-shard',
  'alchemy-shard': 'alchemy-shard',
  'alteration-shard': 'alteration-shard',
  'annulment-shard': 'annulment-shard',
  'transmutation-shard': 'transmutation-shard',
};

/**
 * League name mappings
 */
export const LeagueNames: Record<string, string> = {
  'standard': 'Standard',
  'hardcore': 'Hardcore',
  'dawn-of-the-hunt': 'Dawn of the Hunt',
  'hardcore-dawn-of-the-hunt': 'Hardcore Dawn of the Hunt',
};

/**
 * Item rarity frame types
 */
export enum ItemFrameType {
  Normal = 0,
  Magic = 1,
  Rare = 2,
  Unique = 3,
  Gem = 4,
  Currency = 5,
  DivinationCard = 6,
  Quest = 7,
  Prophecy = 8,
  Relic = 9,
}

/**
 * Socket colors
 */
export enum SocketColor {
  Red = 'R',
  Green = 'G',
  Blue = 'B',
  White = 'W',
  Abyss = 'A',
  Delve = 'D',
}

/**
 * Property display modes
 */
export enum PropertyDisplayMode {
  Name = 0,
  ValuePrefix = 1,
  ValueSuffix = 2,
  Progress = 3,
  Inject = 4,
  Multiline = 5,
}

/**
 * Trade API error response
 */
export interface TradeAPIError {
  error: {
    code: number;
    message: string;
  };
}