import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '../../../src/constants/eventNames';

describe('PERPS_EVENT_PROPERTY', () => {
  describe('advanced chart analytics property keys', () => {
    it('exports CHART_LIBRARY key', () => {
      expect(PERPS_EVENT_PROPERTY.CHART_LIBRARY).toBe('chart_library');
    });

    it('exports CHART_LOAD_LATENCY_MS key', () => {
      expect(PERPS_EVENT_PROPERTY.CHART_LOAD_LATENCY_MS).toBe(
        'chart_load_latency_ms',
      );
    });

    it('exports ASSET_TYPE key', () => {
      expect(PERPS_EVENT_PROPERTY.ASSET_TYPE).toBe('asset_type');
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
