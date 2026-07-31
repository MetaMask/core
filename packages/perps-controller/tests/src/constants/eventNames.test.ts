import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '../../../src/constants/eventNames.js';
import { PerpsAnalyticsEvent } from '../../../src/types/index.js';

describe('PERPS_EVENT_PROPERTY', () => {
  describe('advanced chart analytics property keys', () => {
    it('exports CHART_LIBRARY key', () => {
      expect(PERPS_EVENT_PROPERTY.CHART_LIBRARY).toBe('chart_library');
    });

    it('exports ASSET_TYPE key', () => {
      expect(PERPS_EVENT_PROPERTY.ASSET_TYPE).toBe('asset_type');
    });
  });

  describe('Auto Close TP/SL RoE sign analytics keys', () => {
    it('exports ROE_SIGN property key', () => {
      expect(PERPS_EVENT_PROPERTY.ROE_SIGN).toBe('roe_sign');
    });
  });

  describe('consolidated analytics contract property keys (TAT-3463)', () => {
    it('exports entry point / discovery attribution keys (TAT-3080)', () => {
      expect(PERPS_EVENT_PROPERTY.ENTRY_POINT).toBe('entry_point');
      expect(PERPS_EVENT_PROPERTY.DISCOVERY_SOURCE).toBe('discovery_source');
      expect(PERPS_EVENT_PROPERTY.PERP_DISCOVERY_SOURCE).toBe(
        'perp_discovery_source',
      );
    });

    it('exports UTM attribution keys (TAT-3133, TAT-3140)', () => {
      expect(PERPS_EVENT_PROPERTY.UTM_SOURCE).toBe('utm_source');
      expect(PERPS_EVENT_PROPERTY.UTM_MEDIUM).toBe('utm_medium');
      expect(PERPS_EVENT_PROPERTY.UTM_CAMPAIGN).toBe('utm_campaign');
      expect(PERPS_EVENT_PROPERTY.UTM_CONTENT).toBe('utm_content');
      expect(PERPS_EVENT_PROPERTY.UTM_TERM).toBe('utm_term');
    });

    it('exports watchlisted, hl_fee_rate, bulk_action_id, environment_type keys', () => {
      expect(PERPS_EVENT_PROPERTY.WATCHLISTED).toBe('watchlisted');
      expect(PERPS_EVENT_PROPERTY.HL_FEE_RATE).toBe('hl_fee_rate');
      expect(PERPS_EVENT_PROPERTY.BULK_ACTION_ID).toBe('bulk_action_id');
      expect(PERPS_EVENT_PROPERTY.ENVIRONMENT_TYPE).toBe('environment_type');
    });

    it('exports order funnel / quote keys (TAT-3084)', () => {
      expect(PERPS_EVENT_PROPERTY.ORDER_CONTEXT).toBe('order_context');
      expect(PERPS_EVENT_PROPERTY.ORDER_SIZE_PERCENT).toBe(
        'order_size_percent',
      );
      expect(PERPS_EVENT_PROPERTY.LIMIT_PRICE_INPUT_TYPE).toBe(
        'limit_price_input_type',
      );
      expect(PERPS_EVENT_PROPERTY.LIMIT_PRICE_INPUT_PRESET).toBe(
        'limit_price_input_preset',
      );
      expect(PERPS_EVENT_PROPERTY.ORDER_HAS_TP).toBe('order_has_tp');
      expect(PERPS_EVENT_PROPERTY.ORDER_HAS_SL).toBe('order_has_sl');
      expect(PERPS_EVENT_PROPERTY.QUOTE_LATENCY_MS).toBe('quote_latency_ms');
      expect(PERPS_EVENT_PROPERTY.ERROR_REASON).toBe('error_reason');
      expect(PERPS_EVENT_PROPERTY.SAVED_ORDER).toBe('saved_order');
      expect(PERPS_EVENT_PROPERTY.DEFAULT_PAYMENT_TOKEN).toBe(
        'default_payment_token',
      );
      expect(PERPS_EVENT_PROPERTY.DEFAULT_SIZE_AMOUNT).toBe(
        'default_size_amount',
      );
      expect(PERPS_EVENT_PROPERTY.DEFAULT_LEVERAGE).toBe('default_leverage');
      expect(PERPS_EVENT_PROPERTY.DEFAULT_AUTO_CLOSE).toBe(
        'default_auto_close',
      );
      expect(PERPS_EVENT_PROPERTY.ORDER_EXECUTION_LATENCY_MS).toBe(
        'order_execution_latency_ms',
      );
      expect(PERPS_EVENT_PROPERTY.SCREEN_CONTEXT).toBe('screen_context');
      expect(PERPS_EVENT_PROPERTY.FROM_TOKEN).toBe('from_token');
      expect(PERPS_EVENT_PROPERTY.FROM_CHAIN).toBe('from_chain');
      expect(PERPS_EVENT_PROPERTY.TO_TOKEN).toBe('to_token');
      expect(PERPS_EVENT_PROPERTY.TO_CHAIN).toBe('to_chain');
    });

    it('exports search keys (TAT-3144, TAT-3202, TAT-3151)', () => {
      expect(PERPS_EVENT_PROPERTY.SEARCH_QUERY).toBe('search_query');
      expect(PERPS_EVENT_PROPERTY.RESULTS_COUNT).toBe('results_count');
      expect(PERPS_EVENT_PROPERTY.RESULT_RANK).toBe('result_rank');
      expect(PERPS_EVENT_PROPERTY.MODE).toBe('mode');
      expect(PERPS_EVENT_PROPERTY.CURRENT_TOKEN).toBe('current_token');
    });

    it('exports sort / filter and time-on-screen keys (TAT-3142, TAT-3136)', () => {
      expect(PERPS_EVENT_PROPERTY.SORT_FIELD).toBe('sort_field');
      expect(PERPS_EVENT_PROPERTY.SORT_DIRECTION).toBe('sort_direction');
      expect(PERPS_EVENT_PROPERTY.FILTER_CATEGORY).toBe('filter_category');
      expect(PERPS_EVENT_PROPERTY.TIME_ON_SCREEN_MS).toBe('time_on_screen_ms');
    });
  });

  describe('discovery analytics property keys', () => {
    it('exports SOURCE_SECTION key', () => {
      expect(PERPS_EVENT_PROPERTY.SOURCE_SECTION).toBe('source_section');
    });

    it('exports RESULT_COUNT key', () => {
      expect(PERPS_EVENT_PROPERTY.RESULT_COUNT).toBe('result_count');
    });

    it('exports SECTION_NAME key', () => {
      expect(PERPS_EVENT_PROPERTY.SECTION_NAME).toBe('section_name');
    });

    it('exports SECTION_INDEX key', () => {
      expect(PERPS_EVENT_PROPERTY.SECTION_INDEX).toBe('section_index');
    });

    it('exports SECTIONS_DISPLAYED key', () => {
      expect(PERPS_EVENT_PROPERTY.SECTIONS_DISPLAYED).toBe(
        'sections_displayed',
      );
    });

    it('exports WATCHLIST_COUNT key', () => {
      expect(PERPS_EVENT_PROPERTY.WATCHLIST_COUNT).toBe('watchlist_count');
    });

    it('exports WATCHLIST_MARKETS key', () => {
      expect(PERPS_EVENT_PROPERTY.WATCHLIST_MARKETS).toBe('watchlist_markets');
    });
  });
});

describe('PERPS_EVENT_VALUE.CHART_LIBRARY', () => {
  it('exports LIGHTWEIGHT', () => {
    expect(PERPS_EVENT_VALUE.CHART_LIBRARY.LIGHTWEIGHT).toBe('lightweight');
  });

  it('exports ADVANCED', () => {
    expect(PERPS_EVENT_VALUE.CHART_LIBRARY.ADVANCED).toBe('advanced');
  });
});

describe('PERPS_EVENT_VALUE.ASSET_TYPE', () => {
  it('exports SPOT', () => {
    expect(PERPS_EVENT_VALUE.ASSET_TYPE.SPOT).toBe('spot');
  });

  it('exports PERP', () => {
    expect(PERPS_EVENT_VALUE.ASSET_TYPE.PERP).toBe('perp');
  });
});

describe('PERPS_EVENT_VALUE.SOURCE_SECTION', () => {
  describe('home section values', () => {
    it('exports POSITIONS', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.POSITIONS).toBe('positions');
    });

    it('exports ORDERS', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.ORDERS).toBe('orders');
    });

    it('exports WATCHLIST', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.WATCHLIST).toBe('watchlist');
    });

    it('exports WHATS_HAPPENING', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.WHATS_HAPPENING).toBe(
        'whats_happening',
      );
    });

    it('exports PRODUCTS', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.PRODUCTS).toBe('products');
    });

    it('exports TOP_GAINERS', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.TOP_GAINERS).toBe('top_gainers');
    });

    it('exports TOP_LOSERS', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.TOP_LOSERS).toBe('top_losers');
    });

    it('exports CRYPTO', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.CRYPTO).toBe('crypto');
    });

    it('exports COMMODITY', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.COMMODITY).toBe('commodity');
    });

    it('exports STOCK', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.STOCK).toBe('stock');
    });

    it('exports FOREX', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.FOREX).toBe('forex');
    });
  });

  describe('explore section values', () => {
    it('exports PERPS_MOVERS', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.PERPS_MOVERS).toBe(
        'perps_movers',
      );
    });

    it('exports PERPS_CRYPTO', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.PERPS_CRYPTO).toBe(
        'perps_crypto',
      );
    });

    it('exports PERPS_STOCKS_COMMODITIES', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.PERPS_STOCKS_COMMODITIES).toBe(
        'perps_stocks_commodities',
      );
    });

    it('exports PERPS_MARKETS', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.PERPS_MARKETS).toBe(
        'perps_markets',
      );
    });
  });

  describe('market list section values', () => {
    it('exports ALL_MARKETS', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.ALL_MARKETS).toBe('all_markets');
    });

    it('exports NEW', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.NEW).toBe('new');
    });

    it('exports ACTIVE_SEARCH', () => {
      expect(PERPS_EVENT_VALUE.SOURCE_SECTION.ACTIVE_SEARCH).toBe(
        'active_search',
      );
    });
  });
});

describe('PERPS_EVENT_VALUE.SECTION_NAME', () => {
  it('exports BALANCE', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.BALANCE).toBe('balance');
  });

  it('exports POSITIONS', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.POSITIONS).toBe('positions');
  });

  it('exports ORDERS', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.ORDERS).toBe('orders');
  });

  it('exports WATCHLIST', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.WATCHLIST).toBe('watchlist');
  });

  it('exports WHATS_HAPPENING', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.WHATS_HAPPENING).toBe(
      'whats_happening',
    );
  });

  it('exports PRODUCTS', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.PRODUCTS).toBe('products');
  });

  it('exports TOP_MOVERS', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.TOP_MOVERS).toBe('top_movers');
  });

  it('exports EXPLORE_CRYPTO', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.EXPLORE_CRYPTO).toBe(
      'explore_crypto',
    );
  });

  it('exports EXPLORE_COMMODITIES', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.EXPLORE_COMMODITIES).toBe(
      'explore_commodities',
    );
  });

  it('exports EXPLORE_STOCKS', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.EXPLORE_STOCKS).toBe(
      'explore_stocks',
    );
  });

  it('exports EXPLORE_FOREX', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.EXPLORE_FOREX).toBe('explore_forex');
  });

  it('exports RECENT_ACTIVITY', () => {
    expect(PERPS_EVENT_VALUE.SECTION_NAME.RECENT_ACTIVITY).toBe(
      'recent_activity',
    );
  });
});

describe('PERPS_EVENT_VALUE.INTERACTION_TYPE extensions', () => {
  it('exports MARKET_LIST_FILTER', () => {
    expect(PERPS_EVENT_VALUE.INTERACTION_TYPE.MARKET_LIST_FILTER).toBe(
      'market_list_filter',
    );
  });
});

describe('PERPS_EVENT_VALUE.BUTTON_CLICKED extensions', () => {
  it('exports WATCHLIST', () => {
    expect(PERPS_EVENT_VALUE.BUTTON_CLICKED.WATCHLIST).toBe('watchlist');
  });

  it('exports TOP_MOVERS', () => {
    expect(PERPS_EVENT_VALUE.BUTTON_CLICKED.TOP_MOVERS).toBe('top_movers');
  });

  it('exports WHATS_HAPPENING', () => {
    expect(PERPS_EVENT_VALUE.BUTTON_CLICKED.WHATS_HAPPENING).toBe(
      'whats_happening',
    );
  });
});

describe('PERPS_EVENT_VALUE.BUTTON_LOCATION extensions', () => {
  it('exports ASSET_DETAILS', () => {
    expect(PERPS_EVENT_VALUE.BUTTON_LOCATION.ASSET_DETAILS).toBe(
      'asset_details',
    );
  });
});

describe('PERPS_EVENT_VALUE consolidated contract entries (TAT-3463)', () => {
  it('exports new INTERACTION_TYPE values (TAT-3142, TAT-3144, TAT-3202, TAT-3151)', () => {
    expect(PERPS_EVENT_VALUE.INTERACTION_TYPE.SORT_APPLIED).toBe(
      'sort_applied',
    );
    expect(PERPS_EVENT_VALUE.INTERACTION_TYPE.FILTER_APPLIED).toBe(
      'filter_applied',
    );
    expect(PERPS_EVENT_VALUE.INTERACTION_TYPE.SEARCH_RESULT_TAPPED).toBe(
      'search_result_tapped',
    );
    expect(PERPS_EVENT_VALUE.INTERACTION_TYPE.SEARCH_CHIP_TAPPED).toBe(
      'search_chip_tapped',
    );
    expect(PERPS_EVENT_VALUE.INTERACTION_TYPE.SEARCH_SIGNAL_TILE_TAPPED).toBe(
      'search_signal_tile_tapped',
    );
    expect(
      PERPS_EVENT_VALUE.INTERACTION_TYPE.PAYMENT_TOKEN_SELECTOR_DISMISSED,
    ).toBe('payment_token_selector_dismissed');
    expect(PERPS_EVENT_VALUE.INTERACTION_TYPE.TPSL_ROE_SIGN_TOGGLED).toBe(
      'tpsl_roe_sign_toggled',
    );
  });

  it('exports ACTION.ABANDON_ORDER (TAT-3136)', () => {
    expect(PERPS_EVENT_VALUE.ACTION.ABANDON_ORDER).toBe('abandon_order');
  });

  it('exports new BUTTON_CLICKED values (TAT-3135, TAT-3141)', () => {
    expect(PERPS_EVENT_VALUE.BUTTON_CLICKED.PLACE_ORDER).toBe('place_order');
    expect(PERPS_EVENT_VALUE.BUTTON_CLICKED.CLOSE).toBe('close');
    expect(PERPS_EVENT_VALUE.BUTTON_CLICKED.REDUCE_EXPOSURE).toBe(
      'reduce_exposure',
    );
  });

  it('exports new SCREEN_TYPE values and keeps add/remove margin (TAT-3144, TAT-3145)', () => {
    expect(PERPS_EVENT_VALUE.SCREEN_TYPE.SEARCH_RESULTS_SHOWN).toBe(
      'search_results_shown',
    );
    expect(PERPS_EVENT_VALUE.SCREEN_TYPE.SEARCH_NO_RESULTS).toBe(
      'search_no_results',
    );
    // add_margin / remove_margin already existed — verify still present (TAT-3145)
    expect(PERPS_EVENT_VALUE.SCREEN_TYPE.ADD_MARGIN).toBe('add_margin');
    expect(PERPS_EVENT_VALUE.SCREEN_TYPE.REMOVE_MARGIN).toBe('remove_margin');
  });

  it('keeps STATUS.SUBMITTED for transaction pipeline events (TAT-3134)', () => {
    expect(PERPS_EVENT_VALUE.STATUS.SUBMITTED).toBe('submitted');
  });
});

describe('PerpsAnalyticsEvent (TAT-3463)', () => {
  it('adds exactly the five new event names and keeps the nine existing', () => {
    expect(PerpsAnalyticsEvent.TransactionConsidered).toBe(
      'Perp Transaction Considered',
    );
    expect(PerpsAnalyticsEvent.TradeQuoteReceived).toBe(
      'Perp Trade Quote Received',
    );
    expect(PerpsAnalyticsEvent.SearchQuery).toBe('Perp Search Query');
    expect(PerpsAnalyticsEvent.SearchResultTapped).toBe(
      'Perp Search Result Tapped',
    );
    expect(PerpsAnalyticsEvent.SearchAbandoned).toBe('Perp Search Abandoned');

    // No event names invented beyond the five new + nine existing = 14 total.
    expect(Object.keys(PerpsAnalyticsEvent)).toHaveLength(14);
  });
});
