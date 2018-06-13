
"use strict";

/*  ------------------------------------------------------------------------ */

const functions = require ('./functions')
    , Market    = require ('./Market')

const {
    isNode
    , keys
    , values
    , deepExtend
    , extend
    , flatten
    , unique
    , indexBy
    , sortBy
    , groupBy
    , aggregate
    , uuid
    , unCamelCase
    , precisionFromString
    , throttle
    , capitalize
    , now
    , sleep
    , timeout
    , TimedOut
    , buildOHLCVC } = functions

const {
    ExchangeError
    , InvalidAddress
    , NotSupported
    , AuthenticationError
    , DDoSProtection
    , RequestTimeout
    , ExchangeNotAvailable } = require ('./errors')

const { DECIMAL_PLACES } = functions.precisionConstants

const defaultFetch = isNode ? require ('fetch-ponyfill') ().fetch : fetch

const journal = undefined // isNode && require ('./journal') // stub until we get a better solution for Webpack and React

const EventEmitter = require('events')
const WebsocketConnection = require ('./async/websocket_connection')
const AsyncSymbolContext = require ('./async/async_symbol_context')

/*  ------------------------------------------------------------------------ */

module.exports = class Exchange extends EventEmitter{

    getMarket (symbol) {

        if (!this.marketClasses)
            this.marketClasses = {}

        let marketClass = this.marketClasses[symbol]

        if (marketClass)
            return marketClass

        marketClass = new Market (this, symbol)
        this.marketClasses[symbol] = marketClass // only one Market instance per market
        return marketClass
    }

    describe () {
        return {
            'id': undefined,
            'name': undefined,
            'countries': undefined,
            'enableRateLimit': false,
            'rateLimit': 2000, // milliseconds = seconds * 1000
            'has': {
                'CORS': false,
                'publicAPI': true,
                'privateAPI': true,
                'cancelOrder': true,
                'cancelOrders': false,
                'createDepositAddress': false,
                'createOrder': true,
                'createMarketOrder': true,
                'createLimitOrder': true,
                'deposit': false,
                'editOrder': 'emulated',
                'fetchBalance': true,
                'fetchBidsAsks': false,
                'fetchClosedOrders': false,
                'fetchCurrencies': false,
                'fetchDepositAddress': false,
                'fetchFundingFees': false,
                'fetchL2OrderBook': true,
                'fetchMarkets': true,
                'fetchMyTrades': false,
                'fetchOHLCV': 'emulated',
                'fetchOpenOrders': false,
                'fetchOrder': false,
                'fetchOrderBook': true,
                'fetchOrderBooks': false,
                'fetchOrders': false,
                'fetchTicker': true,
                'fetchTickers': false,
                'fetchTrades': true,
                'fetchTradingFees': false,
                'withdraw': false,
            },
            'urls': {
                'logo': undefined,
                'api': undefined,
                'www': undefined,
                'doc': undefined,
                'fees': undefined,
            },
            'api': undefined,
            'asyncconf': undefined,
            'requiredCredentials': {
                'apiKey':   true,
                'secret':   true,
                'uid':      false,
                'login':    false,
                'password': false,
                'twofa':    false, // 2-factor authentication (one-time password key)
            },
            'markets': undefined, // to be filled manually or by fetchMarkets
            'currencies': {}, // to be filled manually or by fetchMarkets
            'timeframes': undefined, // redefine if the exchange has.fetchOHLCV
            'fees': {
                'trading': {
                    'tierBased': undefined,
                    'percentage': undefined,
                    'taker': undefined,
                    'maker': undefined,
                },
                'funding': {
                    'tierBased': undefined,
                    'percentage': undefined,
                    'withdraw': {},
                    'deposit': {},
                },
            },
            'parseJsonResponse': true, // whether a reply is required to be in JSON or not
            'skipJsonOnStatusCodes': [], // array of http status codes which override requirement for JSON response
            'exceptions': undefined,
            // some exchanges report only 'free' on `fetchBlance` call (i.e. report no 'used' funds)
            // in this case ccxt will try to infer 'used' funds from open order cache, which might be stale
            // still, some exchanges report number of open orders together with balance
            // if you set the following flag to 'true' ccxt will leave 'used' funds undefined in case of discrepancy
            'dontGetUsedBalanceFromStaleCache': false,
            'commonCurrencies': { // gets extended/overwritten in subclasses
                'XBT': 'BTC',
                'BCC': 'BCH',
                'DRK': 'DASH',
            },
            'precisionMode': DECIMAL_PLACES,
        } // return
    } // describe ()

    constructor (userConfig = {}) {
        super();

        Object.assign (this, functions, { encode: string => string, decode: string => string })

        if (isNode)
            this.nodeVersion = process.version.match (/\d+\.\d+.\d+/)[0]

        // if (isNode) {
        //     this.userAgent = {
        //         'User-Agent': 'ccxt/' + Exchange.ccxtVersion +
        //             ' (+https://github.com/ccxt/ccxt)' +
        //             ' Node.js/' + this.nodeVersion + ' (JavaScript)'
        //     }
        // }

        this.options = {} // exchange-specific options, if any

        this.userAgents = {
            'chrome': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36',
            'chrome39': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36',
        }

        this.headers = {}

        // prepended to URL, like https://proxy.com/https://exchange.com/api...
        this.proxy = ''
        this.origin = '*' // CORS origin

        this.iso8601          = timestamp => ((typeof timestamp === 'undefined') ? timestamp : new Date (timestamp).toISOString ())
        this.parse8601        = x => Date.parse ((((x.indexOf ('+') >= 0) || (x.slice (-1) === 'Z')) ? x : (x + 'Z').replace (/\s(\d\d):/, 'T$1:')))
        this.parseDate        = (x) => {
            if (typeof x === 'undefined')
                return x
            return ((x.indexOf ('GMT') >= 0) ?
                Date.parse (x) :
                this.parse8601 (x))
        }
        this.microseconds     = () => now () * 1000 // TODO: utilize performance.now for that purpose
        this.seconds          = () => Math.floor (now () / 1000)

        this.minFundingAddressLength = 1 // used in checkAddress
        this.substituteCommonCurrencyCodes = true  // reserved

        // do not delete this line, it is needed for users to be able to define their own fetchImplementation
        this.fetchImplementation = defaultFetch

        this.timeout          = 10000 // milliseconds
        this.verbose          = false
        this.debug            = false
        this.journal          = 'debug.json'
        this.userAgent        = undefined
        this.twofa            = false // two-factor authentication (2FA)

        this.apiKey   = undefined
        this.secret   = undefined
        this.uid      = undefined
        this.login    = undefined
        this.password = undefined

        this.balance    = {}
        this.orderbooks = {}
        this.tickers    = {}
        this.orders     = {}
        this.trades     = {}

        this.last_http_response = undefined
        this.last_json_response = undefined
        this.last_response_headers = undefined

        this.arrayConcat = (a, b) => a.concat (b)

        const unCamelCaseProperties = (obj = this) => {
            if (obj !== null) {
                for (const k of Object.getOwnPropertyNames (obj)) {
                    this[unCamelCase (k)] = this[k]
                }
                unCamelCaseProperties (Object.getPrototypeOf (obj))
            }
        }
        unCamelCaseProperties ()

        // merge configs
        const config = deepExtend (this.describe (), userConfig)

        // merge to this
        for (const [property, value] of Object.entries (config))
            this[property] = deepExtend (this[property], value)

        // generate old metainfo interface
        for (const k in this.has) {
            this['has' + capitalize (k)] = !!this.has[k] // converts 'emulated' to true
        }

        if (this.api)
            this.defineRestApi (this.api, 'request')

        this.asyncConectionPool = {};
        this.asyncResetContext();

        //if (this.asyncconf)
        //    this.defineAsyncConnection (this.asyncconf);

        this.initRestRateLimiter ()

        if (this.markets)
            this.setMarkets (this.markets)

        if (this.debug && journal) {
            journal (() => this.journal, this, Object.keys (this.has))
        }
    }

    defaults () {
        return { /* override me */ }
    }

    nonce () {
        return this.seconds ()
    }

    milliseconds () {
        return now ()
    }

    encodeURIComponent (...args) {
        return encodeURIComponent (...args)
    }

    checkRequiredCredentials () {
        Object.keys (this.requiredCredentials).forEach ((key) => {
            if (this.requiredCredentials[key] && !this[key])
                throw new AuthenticationError (this.id + ' requires `' + key + '`')
        })
    }

    checkAddress (address) {

        if (typeof address === 'undefined')
            throw new InvalidAddress (this.id + ' address is undefined')

        // check the address is not the same letter like 'aaaaa' nor too short nor has a space
        if ((unique (address).length === 1) || address.length < this.minFundingAddressLength || address.includes (' '))
            throw new InvalidAddress (this.id + ' address is invalid or has less than ' + this.minFundingAddressLength.toString () + ' characters: "' + address.toString () + '"')

        return address
    }

    initRestRateLimiter () {

        const fetchImplementation = this.fetchImplementation

        if (this.rateLimit === undefined)
            throw new Error (this.id + '.rateLimit property is not configured')

        this.tokenBucket = this.extend ({
            refillRate:  1 / this.rateLimit,
            delay:       1,
            capacity:    1,
            defaultCost: 1,
            maxCapacity: 1000,
        }, this.tokenBucket)

        this.throttle = throttle (this.tokenBucket)

        this.executeRestRequest = function (url, method = 'GET', headers = undefined, body = undefined) {

            let promise =
                fetchImplementation (url, { method, headers, body, 'agent': this.agent || null, timeout: this.timeout })
                    .catch (e => {
                        if (isNode)
                            throw new ExchangeNotAvailable ([ this.id, method, url, e.type, e.message ].join (' '))
                        throw e // rethrow all unknown errors
                    })
                    .then (response => this.handleRestResponse (response, url, method, headers, body))

            return timeout (this.timeout, promise).catch (e => {
                if (e instanceof TimedOut)
                    throw new RequestTimeout (this.id + ' ' + method + ' ' + url + ' request timed out (' + this.timeout + ' ms)')
                throw e
            })
        }
    }

    defineRestApi (api, methodName, options = {}) {

        for (const type of Object.keys (api)) {
            for (const httpMethod of Object.keys (api[type])) {

                let paths = api[type][httpMethod]
                for (let i = 0; i < paths.length; i++) {
                    let path = paths[i].trim ()
                    let splitPath = path.split (/[^a-zA-Z0-9]/)

                    let uppercaseMethod  = httpMethod.toUpperCase ()
                    let lowercaseMethod  = httpMethod.toLowerCase ()
                    let camelcaseMethod  = this.capitalize (lowercaseMethod)
                    let camelcaseSuffix  = splitPath.map (this.capitalize).join ('')
                    let underscoreSuffix = splitPath.map (x => x.trim ().toLowerCase ()).filter (x => x.length > 0).join ('_')

                    let camelcase  = type + camelcaseMethod + this.capitalize (camelcaseSuffix)
                    let underscore = type + '_' + lowercaseMethod + '_' + underscoreSuffix

                    if ('suffixes' in options) {
                        if ('camelcase' in options['suffixes'])
                            camelcase += options['suffixes']['camelcase']
                        if ('underscore' in options.suffixes)
                            underscore += options['suffixes']['underscore']
                    }

                    if ('underscore_suffix' in options)
                        underscore += options.underscoreSuffix;
                    if ('camelcase_suffix' in options)
                        camelcase += options.camelcaseSuffix;

                    let partial = async params => this[methodName] (path, type, uppercaseMethod, params || {})

                    this[camelcase]  = partial
                    this[underscore] = partial
                }
            }
        }
    }

    //defineAsyncConnection (asyncConfig) {
    //    if (asyncConfig.type === 'ws') {
    //        this.asyncConnection = new WebsocketConnection (asyncConfig, this.timeout);
    //        this.asyncInitialize();
    //    }
    //}

    fetch (url, method = 'GET', headers = undefined, body = undefined) {

        if (isNode && this.userAgent) {
            if (typeof this.userAgent === 'string')
                headers = extend ({ 'User-Agent': this.userAgent }, headers)
            else if ((typeof this.userAgent === 'object') && ('User-Agent' in this.userAgent))
                headers = extend (this.userAgent, headers)
        }

        if (typeof this.proxy === 'function') {

            url = this.proxy (url)
            if (isNode)
                headers = extend ({ 'Origin': this.origin }, headers)

        } else if (typeof this.proxy === 'string') {

            if (this.proxy.length)
                if (isNode)
                    headers = extend ({ 'Origin': this.origin }, headers)

            url = this.proxy + url
        }

        headers = extend (this.headers, headers)

        if (this.verbose)
            console.log ("fetch:\n", this.id, method, url, "\nRequest:\n", headers, "\n", body, "\n")

        return this.executeRestRequest (url, method, headers, body)
    }

    async fetch2 (path, type = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {

        if (this.enableRateLimit)
            await this.throttle ()

        let request = this.sign (path, type, method, params, headers, body)
        return this.fetch (request.url, request.method, request.headers, request.body)
    }

    request (path, type = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        return this.fetch2 (path, type, method, params, headers, body)
    }

    parseJson (response, responseBody, url, method) {
        try {

            return (responseBody.length > 0) ? JSON.parse (responseBody) : {} // empty object for empty body

        } catch (e) {

            if (this.verbose)
                console.log ('parseJson:\n', this.id, method, url, response.status, 'error', e, "response body:\n'" + responseBody + "'\n")

            let title = undefined
            let match = responseBody.match (/<title>([^<]+)/i)
            if (match)
                title = match[1].trim ();

            let maintenance = responseBody.match (/offline|busy|retry|wait|unavailable|maintain|maintenance|maintenancing/i)
            let ddosProtection = responseBody.match (/cloudflare|incapsula|overload|ddos/i)

            if (e instanceof SyntaxError) {

                let ExceptionClass = ExchangeNotAvailable
                let details = 'not accessible from this location at the moment'
                if (maintenance)
                    details = 'offline, on maintenance or unreachable from this location at the moment'
                if (ddosProtection)
                    ExceptionClass = DDoSProtection
                throw new ExceptionClass ([ this.id, method, url, response.status, title, details ].join (' '))
            }

            throw e
        }
    }

    handleErrors (statusCode, statusText, url, method, requestHeaders, responseBody, json) {
        // override me
    }

    defaultErrorHandler (response, responseBody, url, method) {
        const { status: code, statusText: reason } = response
        if ((code >= 200) && (code <= 299))
            return
        let error = undefined
        let details = responseBody
        let match = responseBody.match (/<title>([^<]+)/i)
        if (match)
            details = match[1].trim ();
        if ([ 418, 429 ].includes (code)) {
            error = DDoSProtection
        } else if ([ 404, 409, 500, 501, 502, 520, 521, 522, 525 ].includes (code)) {
            error = ExchangeNotAvailable
        } else if ([ 400, 403, 405, 503, 530 ].includes (code)) {
            let ddosProtection = responseBody.match (/cloudflare|incapsula/i)
            if (ddosProtection) {
                error = DDoSProtection
            } else {
                error = ExchangeNotAvailable
                details += ' (possible reasons: ' + [
                    'invalid API keys',
                    'bad or old nonce',
                    'exchange is down or offline',
                    'on maintenance',
                    'DDoS protection',
                    'rate-limiting',
                ].join (', ') + ')'
            }
        } else if ([ 408, 504 ].includes (code)) {
            error = RequestTimeout
        } else if ([ 401, 511 ].includes (code)) {
            error = AuthenticationError
        } else {
            error = ExchangeError
        }
        throw new error ([ this.id, method, url, code, reason, details ].join (' '))
    }

    handleRestResponse (response, url, method = 'GET', requestHeaders = undefined, requestBody = undefined) {

        return response.text ().then ((responseBody) => {

            let jsonRequired = this.parseJsonResponse && !this.skipJsonOnStatusCodes.includes (response.status)
            let json = jsonRequired ? this.parseJson (response, responseBody, url, method) : undefined

            let responseHeaders = {}
            response.headers.forEach ((value, key) => {
                key = key.split ('-').map (word => capitalize (word)).join ('-')
                responseHeaders[key] = value;
            })

            this.last_response_headers = responseHeaders
            this.last_http_response = responseBody // FIXME: for those classes that haven't switched to handleErrors yet
            this.last_json_response = json         // FIXME: for those classes that haven't switched to handleErrors yet

            if (this.verbose)
                console.log ("handleRestResponse:\n", this.id, method, url, response.status, response.statusText, "\nResponse:\n", responseHeaders, "\n", responseBody, "\n")

            const args = [ response.status, response.statusText, url, method, responseHeaders, responseBody, json ]
            this.handleErrors (...args)
            this.defaultErrorHandler (response, responseBody, url, method)

            return jsonRequired ? json : responseBody
        })
    }

    setMarkets (markets, currencies = undefined) {
        let values = Object.values (markets).map (market => deepExtend ({
            'limits': this.limits,
            'precision': this.precision,
        }, this.fees['trading'], market))
        this.markets = deepExtend (this.markets, indexBy (values, 'symbol'))
        this.marketsById = indexBy (markets, 'id')
        this.markets_by_id = this.marketsById
        this.symbols = Object.keys (this.markets).sort ()
        this.ids = Object.keys (this.markets_by_id).sort ()
        if (currencies) {
            this.currencies = deepExtend (currencies, this.currencies)
        } else {
            const baseCurrencies =
                values.filter (market => 'base' in market)
                    .map (market => ({
                        id: market.baseId || market.base,
                        code: market.base,
                        precision: market.precision ? (market.precision.base || market.precision.amount) : 8,
                    }))
            const quoteCurrencies =
                values.filter (market => 'quote' in market)
                    .map (market => ({
                        id: market.quoteId || market.quote,
                        code: market.quote,
                        precision: market.precision ? (market.precision.quote || market.precision.price) : 8,
                    }))
            const allCurrencies = baseCurrencies.concat (quoteCurrencies)
            const groupedCurrencies = groupBy (allCurrencies, 'code')
            const currencies = Object.keys (groupedCurrencies).map (code =>
                groupedCurrencies[code].reduce ((previous, current) =>
                    ((previous.precision > current.precision) ? previous : current), groupedCurrencies[code][0]))
            const sortedCurrencies = sortBy (flatten (currencies), 'code')
            this.currencies = deepExtend (indexBy (sortedCurrencies, 'code'), this.currencies)
        }
        this.currencies_by_id = indexBy (this.currencies, 'id')
        return this.markets
    }

    async loadMarkets (reload = false) {
        if (!reload && this.markets) {
            if (!this.markets_by_id) {
                return this.setMarkets (this.markets)
            }
            return this.markets
        }
        const markets = await this.fetchMarkets ()
        let currencies = undefined
        if (this.has.fetchCurrencies) {
            currencies = await this.fetchCurrencies ()
        }
        return this.setMarkets (markets, currencies)
    }

    fetchBidsAsks (symbols = undefined, params = {}) {
        throw new NotSupported (this.id + ' fetchBidsAsks not supported yet')
    }

    async fetchOHLCVC (symbol, timeframe = '1m', since = undefined, limits = undefined, params = {}) {
        if (!this.has['fetchTrades'])
            throw new NotSupported (this.id + ' fetchOHLCV() not supported yet')
        await this.loadMarkets ()
        let trades = await this.fetchTrades (symbol, since, limits, params)
        let ohlcvc = buildOHLCVC (trades, timeframe, since, limits)
        return ohlcvc
    }

    async fetchOHLCV (symbol, timeframe = '1m', since = undefined, limits = undefined, params = {}) {
        if (!this.has['fetchTrades'])
            throw new NotSupported (this.id + ' fetchOHLCV() not supported yet')
        await this.loadMarkets ()
        let trades = await this.fetchTrades (symbol, since, limits, params)
        let ohlcvc = buildOHLCVC (trades, timeframe, since, limits)
        return ohlcvc.map (c => c.slice (0, -1))
    }

    convertTradingViewToOHLCV (ohlcvs) {
        let result = [];
        for (let i = 0; i < ohlcvs['t'].length; i++) {
            result.push ([
                ohlcvs['t'][i] * 1000,
                ohlcvs['o'][i],
                ohlcvs['h'][i],
                ohlcvs['l'][i],
                ohlcvs['c'][i],
                ohlcvs['v'][i],
            ]);
        }
        return result;
    }

    convertOHLCVToTradingView (ohlcvs) {
        let result = {
            't': [],
            'o': [],
            'h': [],
            'l': [],
            'c': [],
            'v': [],
        };
        for (let i = 0; i < ohlcvs.length; i++) {
            result['t'].push (parseInt (ohlcvs[i][0] / 1000));
            result['o'].push (ohlcvs[i][1]);
            result['h'].push (ohlcvs[i][2]);
            result['l'].push (ohlcvs[i][3]);
            result['c'].push (ohlcvs[i][4]);
            result['v'].push (ohlcvs[i][5]);
        }
        return result;
    }

    fetchTickers (symbols = undefined, params = {}) {
        throw new NotSupported (this.id + ' fetchTickers not supported yet')
    }

    purgeCachedOrders (before) {
        const orders = Object
            .values (this.orders)
            .filter (order =>
                (order.status === 'open') ||
                (order.timestamp >= before))
        this.orders = indexBy (orders, 'id')
        return this.orders
    }

    fetchOrder (id, symbol = undefined, params = {}) {
        throw new NotSupported (this.id + ' fetchOrder not supported yet');
    }

    fetchOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        throw new NotSupported (this.id + ' fetchOrders not supported yet');
    }

    fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        throw new NotSupported (this.id + ' fetchOpenOrders not supported yet');
    }

    fetchClosedOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        throw new NotSupported (this.id + ' fetchClosedOrders not supported yet');
    }

    fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        throw new NotSupported (this.id + ' fetchMyTrades not supported yet');
    }

    fetchCurrencies () {
        throw new NotSupported (this.id + ' fetchCurrencies not supported yet');
    }

    fetchMarkets () {
        return new Promise ((resolve, reject) => resolve (Object.values (this.markets)))
    }

    async fetchOrderStatus (id, market = undefined) {
        let order = await this.fetchOrder (id, market);
        return order['status'];
    }

    account () {
        return {
            'free': 0.0,
            'used': 0.0,
            'total': 0.0,
        }
    }

    commonCurrencyCode (currency) {
        if (!this.substituteCommonCurrencyCodes)
            return currency
        return this.safeString (this.commonCurrencies, currency, currency)
    }

    currencyId (commonCode) {
        let currencyIds = {}
        let distinct = Object.keys (this.commonCurrencies)
        for (let i = 0; i < distinct.length; i++) {
            let k = distinct[i]
            currencyIds[this.commonCurrencies[k]] = k
        }
        return this.safeString (currencyIds, commonCode, commonCode)
    }

    currency (code) {

        if (typeof this.currencies === 'undefined')
            throw new ExchangeError (this.id + ' currencies not loaded')

        if ((typeof code === 'string') && (code in this.currencies))
            return this.currencies[code]

        throw new ExchangeError (this.id + ' does not have currency code ' + code)
    }

    findMarket (string) {

        if (typeof this.markets === 'undefined')
            throw new ExchangeError (this.id + ' markets not loaded')

        if (typeof string === 'string') {

            if (string in this.markets_by_id)
                return this.markets_by_id[string]

            if (string in this.markets)
                return this.markets[string]
        }

        return string
    }

    findSymbol (string, market = undefined) {

        if (typeof market === 'undefined')
            market = this.findMarket (string)

        if (typeof market === 'object')
            return market['symbol']

        return string
    }

    market (symbol) {

        if (typeof this.markets === 'undefined')
            throw new ExchangeError (this.id + ' markets not loaded')

        if ((typeof symbol === 'string') && (symbol in this.markets))
            return this.markets[symbol]

        throw new ExchangeError (this.id + ' does not have market symbol ' + symbol)
    }

    marketId (symbol) {
        let market = this.market (symbol)
        return (typeof market !== 'undefined' ? market['id'] : symbol)
    }

    marketIds (symbols) {
        return symbols.map (symbol => this.marketId (symbol));
    }

    symbol (symbol) {
        return this.market (symbol).symbol || symbol
    }

    extractParams (string) {
        let re = /{([\w-]+)}/g
        let matches = []
        let match = re.exec (string)
        while (match) {
            matches.push (match[1])
            match = re.exec (string)
        }
        return matches
    }

    implodeParams (string, params) {
        for (let property in params)
            string = string.replace ('{' + property + '}', params[property])
        return string
    }

    url (path, params = {}) {
        let result = this.implodeParams (path, params);
        let query = this.omit (params, this.extractParams (path))
        if (Object.keys (query).length)
            result += '?' + this.urlencode (query)
        return result
    }

    parseBidAsk (bidask, priceKey = 0, amountKey = 1) {
        let price = parseFloat (bidask[priceKey])
        let amount = parseFloat (bidask[amountKey])
        return [ price, amount ]
    }

    parseBidsAsks (bidasks, priceKey = 0, amountKey = 1) {
        return Object.values (bidasks || []).map (bidask => this.parseBidAsk (bidask, priceKey, amountKey))
    }

    async fetchL2OrderBook (symbol, limit = undefined, params = {}) {
        let orderbook = await this.fetchOrderBook (symbol, limit, params)
        return extend (orderbook, {
            'bids': sortBy (aggregate (orderbook.bids), 0, true),
            'asks': sortBy (aggregate (orderbook.asks), 0),
        })
    }

    parseOrderBook (orderbook, timestamp = undefined, bidsKey = 'bids', asksKey = 'asks', priceKey = 0, amountKey = 1) {
        return {
            'bids': sortBy ((bidsKey in orderbook) ? this.parseBidsAsks (orderbook[bidsKey], priceKey, amountKey) : [], 0, true),
            'asks': sortBy ((asksKey in orderbook) ? this.parseBidsAsks (orderbook[asksKey], priceKey, amountKey) : [], 0),
            'timestamp': timestamp,
            'datetime': (typeof timestamp !== 'undefined') ? this.iso8601 (timestamp) : undefined,
            'nonce': undefined,
        }
    }

    searchIndexToInsertOrUpdate (value, orderedArray, key, descending = false) {
        let i;
        let direction = descending ? -1 : 1;
        let compare = (a, b) =>
                ((a[key] < b[key]) ? -direction :
                ((a[key] > b[key]) ?  direction : 0));
        for (i = 0; i < orderedArray.length; i++) {
            if (compare (orderedArray[i][key], value)) {
                return i;
            }
        }
        return i;
    }
    updateBidAsk (bidAsk, currentBidsAsks, bids = false) {
        // insert or replace ordered
        let index = this.searchIndexToInsertOrUpdate (bidAsk[0], currentBidsAsks, 0, bids);
        if ((index < currentBidsAsks.length) && (currentBidsAsks[index][0] === bidAsk[0])){
            // found
            if (bidAsk[1] === 0) {
                // remove
                currentBidsAsks.splice (index, 1);
            } else {
                // update
                currentBidsAsks[index] = bidAsk;
            }
        } else {
            if (bidAsk[1] !== 0) {
                // insert
                currentBidsAsks.splice (index, 0, bidAsk);
            }
        }
    }

    mergeOrderBookDelta (currentOrderBook, orderbook, timestamp = undefined, bidsKey = 'bids', asksKey = 'asks', priceKey = 0, amountKey = 1) {
        let bids = (bidsKey in orderbook) ? this.parseBidsAsks (orderbook[bidsKey], priceKey, amountKey) : [];
        bids.forEach ((bid) => this.updateBidAsk (bid, currentOrderBook.bids, true));
        let asks = (asksKey in orderbook) ? this.parseBidsAsks (orderbook[asksKey], priceKey, amountKey) : [];
        asks.forEach ((ask) => this.updateBidAsk (ask, currentOrderBook.asks, false));
        currentOrderBook.timestamp = timestamp;
        currentOrderBook.datetime = (typeof timestamp !== 'undefined') ? this.iso8601 (timestamp) : undefined;
        return currentOrderBook;
    }

    getCurrencyUsedOnOpenOrders (currency) {
        return Object.values (this.orders).filter (order => (order['status'] === 'open')).reduce ((total, order) => {
            let symbol = order['symbol'];
            let market = this.markets[symbol];
            let remaining = order['remaining']
            if (currency === market['base'] && order['side'] === 'sell') {
                return total + remaining
            } else if (currency === market['quote'] && order['side'] === 'buy') {
                return total + (order['price'] * remaining)
            } else {
                return total
            }
        }, 0)
    }

    parseBalance (balance) {

        const currencies = Object.keys (this.omit (balance, 'info'));

        currencies.forEach ((currency) => {

            if (typeof balance[currency].used === 'undefined') {
                // exchange reports only 'free' balance -> try to derive 'used' funds from open orders cache

                if (this.dontGetUsedBalanceFromStaleCache && ('open_orders' in balance['info'])) {
                    // liqui exchange reports number of open orders with balance response
                    // use it to validate the cache
                    const exchangeOrdersCount = balance['info']['open_orders'];
                    const cachedOrdersCount = Object.values (this.orders).filter (order => (order['status'] === 'open')).length;
                    if (cachedOrdersCount === exchangeOrdersCount) {
                        balance[currency].used = this.getCurrencyUsedOnOpenOrders (currency)
                        balance[currency].total = balance[currency].used + balance[currency].free
                    }
                } else {
                    balance[currency].used = this.getCurrencyUsedOnOpenOrders (currency)
                    balance[currency].total = balance[currency].used + balance[currency].free
                }
            }

            [ 'free', 'used', 'total' ].forEach ((account) => {
                balance[account] = balance[account] || {}
                balance[account][currency] = balance[currency][account]
            })
        })

        return balance
    }

    async fetchPartialBalance (part, params = {}) {
        let balance = await this.fetchBalance (params)
        return balance[part]
    }

    fetchFreeBalance (params = {}) {
        return this.fetchPartialBalance ('free', params)
    }

    fetchUsedBalance (params = {}) {
        return this.fetchPartialBalance ('used', params)
    }

    fetchTotalBalance (params = {}) {
        return this.fetchPartialBalance ('total', params)
    }

    filterBySinceLimit (array, since = undefined, limit = undefined) {
        if (typeof since !== 'undefined')
            array = array.filter (entry => entry.timestamp >= since)
        if (typeof limit !== 'undefined')
            array = array.slice (0, limit)
        return array
    }

    filterBySymbolSinceLimit (array, symbol = undefined, since = undefined, limit = undefined) {

        const symbolIsDefined = typeof symbol !== 'undefined'
        const sinceIsDefined = typeof since !== 'undefined'

        // single-pass filter for both symbol and since
        if (symbolIsDefined || sinceIsDefined)
            array = Object.values (array).filter (entry =>
                ((symbolIsDefined ? (entry.symbol === symbol)  : true) &&
                 (sinceIsDefined  ? (entry.timestamp >= since) : true)))

        if (typeof limit !== 'undefined')
            array = Object.values (array).slice (0, limit)

        return array
    }

    filterByArray (objects, key, values = undefined, indexed = true) {

        objects = Object.values (objects)

        // return all of them if no values were passed
        if (typeof values === 'undefined')
            return indexed ? indexBy (objects, key) : objects

        let result = []
        for (let i = 0; i < objects.length; i++) {
            if (values.includes (objects[i][key]))
                result.push (objects[i])
        }

        return indexed ? indexBy (result, key) : result
    }

    parseTrades (trades, market = undefined, since = undefined, limit = undefined) {
        let result = Object.values (trades || []).map (trade => this.parseTrade (trade, market))
        result = sortBy (result, 'timestamp')
        let symbol = (typeof market !== 'undefined') ? market['symbol'] : undefined
        return this.filterBySymbolSinceLimit (result, symbol, since, limit)
    }

    parseOrders (orders, market = undefined, since = undefined, limit = undefined) {
        let result = Object.values (orders).map (order => this.parseOrder (order, market))
        result = sortBy (result, 'timestamp')
        let symbol = (typeof market !== 'undefined') ? market['symbol'] : undefined
        return this.filterBySymbolSinceLimit (result, symbol, since, limit)
    }

    filterBySymbol (array, symbol = undefined) {
        return ((typeof symbol !== 'undefined') ? array.filter (entry => entry.symbol === symbol) : array)
    }

    parseOHLCV (ohlcv, market = undefined, timeframe = '1m', since = undefined, limit = undefined) {
        return Array.isArray (ohlcv) ? ohlcv.slice (0, 6) : ohlcv
    }

    parseOHLCVs (ohlcvs, market = undefined, timeframe = '1m', since = undefined, limit = undefined) {
        ohlcvs = Object.values (ohlcvs)
        let result = []
        for (let i = 0; i < ohlcvs.length; i++) {
            if (limit && (result.length >= limit))
                break;
            let ohlcv = this.parseOHLCV (ohlcvs[i], market, timeframe, since, limit)
            if (since && (ohlcv[0] < since))
                continue
            result.push (ohlcv)
        }
        return result
    }

    editLimitBuyOrder (id, symbol, ...args) {
        return this.editLimitOrder (id, symbol, 'buy', ...args)
    }

    editLimitSellOrder (id, symbol, ...args) {
        return this.editLimitOrder (id, symbol, 'sell', ...args)
    }

    editLimitOrder (id, symbol, ...args) {
        return this.editOrder (id, symbol, 'limit', ...args)
    }

    async editOrder (id, symbol, ...args) {
        if (!this.enableRateLimit)
            throw new ExchangeError (this.id + ' editOrder() requires enableRateLimit = true')
        await this.cancelOrder (id, symbol);
        return this.createOrder (symbol, ...args)
    }

    createLimitOrder (symbol, ...args) {
        return this.createOrder (symbol, 'limit', ...args)
    }

    createMarketOrder (symbol, ...args) {
        return this.createOrder (symbol, 'market', ...args)
    }

    createLimitBuyOrder (symbol, ...args) {
        return this.createOrder  (symbol, 'limit', 'buy', ...args)
    }

    createLimitSellOrder (symbol, ...args) {
        return this.createOrder (symbol, 'limit', 'sell', ...args)
    }

    createMarketBuyOrder (symbol, amount, params = {}) {
        return this.createOrder (symbol, 'market', 'buy', amount, undefined, params)
    }

    createMarketSellOrder (symbol, amount, params = {}) {
        return this.createOrder (symbol, 'market', 'sell', amount, undefined, params)
    }

    costToPrecision (symbol, cost) {
        return parseFloat (cost).toFixed (this.markets[symbol].precision.price)
    }

    priceToPrecision (symbol, price) {
        return parseFloat (price).toFixed (this.markets[symbol].precision.price)
    }

    amountToPrecision (symbol, amount) {
        return this.truncate (amount, this.markets[symbol].precision.amount)
    }

    amountToString (symbol, amount) {
        return this.truncate_to_string (amount, this.markets[symbol].precision.amount)
    }

    amountToLots (symbol, amount) {
        const lot = this.markets[symbol].lot
        return this.amountToPrecision (symbol, Math.floor (amount / lot) * lot)
    }

    feeToPrecision (symbol, fee) {
        return parseFloat (fee).toFixed (this.markets[symbol].precision.price)
    }

    calculateFee (symbol, type, side, amount, price, takerOrMaker = 'taker', params = {}) {
        let market = this.markets[symbol]
        let rate = market[takerOrMaker]
        let cost = parseFloat (this.costToPrecision (symbol, amount * price))
        return {
            'type': takerOrMaker,
            'currency': market['quote'],
            'rate': rate,
            'cost': parseFloat (this.feeToPrecision (symbol, rate * cost)),
        }
    }

    ymd (timestamp, infix = ' ') {
        let date = new Date (timestamp)
        let Y = date.getUTCFullYear ()
        let m = date.getUTCMonth () + 1
        let d = date.getUTCDate ()
        m = m < 10 ? ('0' + m) : m
        d = d < 10 ? ('0' + d) : d
        return Y + '-' + m + '-' + d
    }

    ymdhms (timestamp, infix = ' ') {
        let date = new Date (timestamp)
        let Y = date.getUTCFullYear ()
        let m = date.getUTCMonth () + 1
        let d = date.getUTCDate ()
        let H = date.getUTCHours ()
        let M = date.getUTCMinutes ()
        let S = date.getUTCSeconds ()
        m = m < 10 ? ('0' + m) : m
        d = d < 10 ? ('0' + d) : d
        H = H < 10 ? ('0' + H) : H
        M = M < 10 ? ('0' + M) : M
        S = S < 10 ? ('0' + S) : S
        return Y + '-' + m + '-' + d + infix + H + ':' + M + ':' + S
    }

    // async methods
    asyncContextGetSubscribedEventSymbols (conxid) {
        let ret = [];
        for (let key in this.asyncContext) {
            for (let symbol in this.asyncContext[key]) {
                let symbolContext = this.asyncContext[key][symbol];
                if ((symbolContext.conxid === conxid) && ((symbolContext.subscribed) ||(symbolContext.subscribing))){
                    ret.push ({
                        'event': key,
                        'symbol': symbol,
                    });
                }
            }
        }
        return ret;
    }

    asyncResetContext (conxid = null) {
        if (conxid === null) {
            this.asyncContext = {
                'ob': {},
                'ticker': {},
                'ohlvc': {},
                'trades': {},
            };
        } else {
            for (let key in this.asyncContext) {
                for (let symbol in this.asyncContext[key]) {
                    let symbolContext = this.asyncContext[key][symbol];
                    if (symbolContext.conxid === conxid) {
                        symbolContext.reset();
                    }
                }
            }
        }
    }

    asyncConnectionGet(conxid = 'default') {
        if (this.asyncConectionPool[conxid] === undefined){
            throw new NotSupported ("async <" + conxid + "> not found in this exchange: " + this.id);
        }
        return this.asyncConectionPool[conxid];
    }

    _asyncGetCommandForEvent(event, symbol, subscription=true){
        // if subscription and still subscribed no command returned
        let sym = this.asyncContext[event][symbol];
        if (subscription && (sym != undefined) && (sym.subscribed || sym.subscribing)) {
            return null;
        }
        // if unsubscription and no subscribed and no subscribing no command returned
        if (!subscription && ((sym == undefined) || (!sym.subscribed && !sym.subscribing))) {
            return null;
        }
        // get conexion type for event
        let eventConf = this.safeValue(this.asyncconf['events'], event);
        if (eventConf === undefined) {
            throw ExchangeError ("invalid async configuration for event: " + event + " in exchange: " + this.id);
        }
        let conxTplName = this.safeString (eventConf, 'conx-tpl', 'default');
        let conxTpl = this.safeValue(this.asyncconf['conx-tpls'], conxTplName);
        if (conxTpl === undefined) {
            throw ExchangeError ("tpl async conexion: " + conxTplName + " does not exist in exchange: " + this.id);
        }
        let generators = this.safeValue (eventConf, 'generators', {
            'url': '{baseurl}',
            'id': '{id}',
            'stream': '{symbol}',
        });
        let params = extend ({}, conxTpl, {
            'event': event,
            'symbol': symbol,
            'id': conxTplName,
        });
        let config = extend ({}, conxTpl);
        for (let key in generators) {
            config[key] = this.implodeParams (generators[key], params);
        }
        if (!(('id' in config) && ('url' in config) && ('type' in config))) {
            throw new ExchangeError ("invalid async configuration in exchange: " + this.id);
        }
        switch (config['type']){
            case 'ws':
                return {
                    'command': 'connect',
                    'conx-config': config,
                    'reset-context': 'onconnect',
                };
            case 'ws-s':
                let subscribed = this.asyncContextGetSubscribedEventSymbols(config['id']);
                let nextStreamList = [this.implodeParams (generators['stream'], {
                    'event': event,
                    'symbol': this.marketId (symbol).toLowerCase (),
                })];
                for (let element of subscribed) {
                    let e = element['event'];
                    let s = element['symbol'];
                    nextStreamList.push(this.implodeParams(generators['stream'], {
                        'event': e,
                        'symbol': this.marketId (s).toLowerCase (),
                    }));
                }
                config['stream'] = nextStreamList.sort ().join ('');
                config['url'] = config['url'] + config['stream'];
                return {
                    'command': 'reconnect',
                    'conx-config': config,
                    'reset-context': 'onreconnect',
                };
            default:
                throw NotSupported ("invalid async connection: " + config['type'] + " for exchange " + this.id);
        }
    }

    async asyncEnsureConxActive (event, symbol, subscribe) {
        let command = this._asyncGetCommandForEvent (event, symbol, subscribe);
        if (command !== null) {
            let conxConfig = this.safeValue (command, 'conx-config', {});
            switch(command['command']){
                case 'reconnect':
                    if (conxConfig['id'] in this.asyncConectionPool){
                        this.asyncConectionPool[conxConfig['id']]['conx'].close();
                    }
                    if (command['reset-context'] === 'onreconnect') {
                        this.asyncResetContext(conxConfig['id']);
                    }
                    this.asyncConectionPool[conxConfig['id']] = this.asyncInitialize(conxConfig, conxConfig['id']);
                    break;
                case 'connect':
                    if (conxConfig['id'] in this.asyncConectionPool){
                        if (this.asyncConectionPool[conxConfig['id']]['conx'].isActive()){
                            break;
                        }
                        this.asyncConectionPool[conxConfig['id']]['conx'].close();
                        this.asyncResetContext(conxConfig['id']);
                    } else {
                        this.asyncResetContext(conxConfig['id']);
                    }
                    this.asyncConectionPool[conxConfig['id']] = this.asyncInitialize(conxConfig, conxConfig['id']);
                    break;
            }
            if (this.asyncContext['ob'][symbol] == null){
                this.asyncContext['ob'][symbol] = new AsyncSymbolContext(conxConfig['id']);
            }
            await this.asyncConnect (conxConfig['id']);
        }
    }

    async asyncConnect (conxid = 'default') {
        let asyncConxInfo = this.asyncConnectionGet(conxid);
        await this.loadMarkets();
        if (!asyncConxInfo['ready']) {
            let wait4readyEvent = this.safeString (this.asyncconf['conx-tpls'][conxid], 'wait4readyEvent');
            if (wait4readyEvent != null){
                await new Promise(async (resolve, reject) => {
                    this.once (wait4readyEvent, (success, error) => {
                        if (success) {
                            asyncConxInfo['ready'] = true;
                            resolve();
                        } else {
                            reject(error);
                        }
                    });
                    asyncConxInfo['conx'].connect ();
                });
            } else {
                await asyncConxInfo['conx'].connect ();
            }
        }
    }

    asyncParseJson (rawData) {
        return JSON.parse (rawData);
    }

    asyncClose (conxid = 'default') {
        let asyncConxInfo = this.asyncConnectionGet(conxid);
        asyncConxInfo['conx'].close();
    }

    asyncSend (data, conxid = 'default') {
        let asyncConxInfo = this.asyncConnectionGet(conxid);
        asyncConxInfo['conx'].send(data);
    }

    asyncSendJson (data, conxid = 'default') {
        let asyncConxInfo = this.asyncConnectionGet(conxid);
        if (this.verbose)
            console.log (conxid + "->" + JSON.stringify(data));
        asyncConxInfo['conx'].sendJson(data);
    }

    asyncInitialize (asyncConfig, conxid = 'default') {
        let asyncConnectionInfo = {
            'auth': false,
            'ready': false,
            'conx': null,
        };
        switch (asyncConfig['type']){
            case 'ws':
                asyncConnectionInfo['conx'] = new WebsocketConnection (asyncConfig, this.timeout);
                break;
            case 'ws-s':
                asyncConnectionInfo['conx'] = new WebsocketConnection (asyncConfig, this.timeout);
                break;
            default:
                throw NotSupported ("invalid async connection: " + conxTpl['type'] + " for exchange " + this.id);
        }
        asyncConnectionInfo['conx'].on ('open', () => {
            asyncConnectionInfo['auth'] = false;
            this._asyncEventOnOpen(conxid, asyncConnectionInfo);
        });
        asyncConnectionInfo['conx'].on ('error', (err) => {
            asyncConnectionInfo['auth'] = false;
            this.asyncResetContext (conxid);
            this.emit ('error', err, conxid);
        });
        asyncConnectionInfo['conx'].on ('message', (data) => {
            if (this.verbose)
                console.log (conxid + '<-' + data);
            try {
                this._asyncOnMsg (data, conxid);
            } catch (ex) {
                this.emit ('error', ex, conxid);
            }
        });
        asyncConnectionInfo['conx'].on ('close', () => {
            asyncConnectionInfo['auth'] = false;
            this.asyncResetContext (conxid);
            this.emit ('close', conxid);
        });

        return asyncConnectionInfo;
    }

    timeoutPromise (promise, scope) {
        return timeout (this.timeout, promise).catch (e => {
            if (e instanceof TimedOut)
                throw new RequestTimeout (this.id + ' ' + scope + ' request timed out (' + this.timeout + ' ms)');
            throw e;
        });
    }

    _cloneOrderBook (ob, limit = undefined) {
        let ret =  {
            'timestamp': ob.timestamp,
            'datetime': ob.datetime,
            'nonce': ob.nonce,
        };
        if (limit === undefined) {
            ret['bids'] = ob.bids.slice ();
            ret['asks'] = ob.asks.slice ();
        } else {
            ret['bids'] = ob.bids.slice (0, limit);
            ret['asks'] = ob.asks.slice (0, limit);            
        }
        return ret;
    }

    asyncFetchOrderBook (symbol, limit = undefined) {
        return this.timeoutPromise (new Promise (async (resolve, reject) => {
            try {
                await this.asyncEnsureConxActive ('ob', symbol, true);
                if (this.asyncContext['ob'][symbol].data['ob'] != null) {
                    resolve (this._cloneOrderBook (this.asyncContext.ob[symbol].data['ob'], limit));
                    return;
                }
                let f = (symbolR, ob) => {
                    if (symbolR === symbol) {
                        this.removeListener ('ob', f);
                        resolve (this._cloneOrderBook (ob, limit));
                    }
                }
                this.on ('ob', f);
            } catch (ex) {
                reject (ex);
            }
        }), 'asyncFetchOrderBook');
    }

    asyncSubscribeOrderBook (symbol) {
        let promise = new Promise (async (resolve, reject) => {
            try {
                await this.asyncEnsureConxActive ('ob', symbol, true);
                const oid = this.nonce() + '-' + symbol + '-ob-subscribe';
                this.once (oid, (success) => {
                    if (success) {
                        this.asyncContext['ob'][symbol].subscribed = true;
                        this.asyncContext['ob'][symbol].subscribing = false;
                        resolve ();
                    } else {
                        this.asyncContext['ob'][symbol].subscribed = false;
                        this.asyncContext['ob'][symbol].subscribing = false;            
                        reject ();
                    }
                });
                this.asyncContext['ob'][symbol].subscribing = true;
                this._asyncSubscribeOrderBook (symbol, oid);
            } catch (ex) {
                reject (ex);
            }
        });
        return this.timeoutPromise (promise, 'asyncSubscribeOrderBook');
    }

    _asyncEventOnOpen (conexid, asyncConex) {

    }

    _asyncExecute (method, params, callback, context = {}, thisParam = null) {
        try {
            thisParam = thisParam != null ? thisParam: this;
            let promise = method.apply (thisParam, params);
            let that = this;
            promise.then(function() {
                let args = [].slice.call(arguments);
                args.unshift(null);
                args.unshift(context);
                try {
                    callback.apply (thisParam, args);
                } catch (ex) {
                    console.log (ex.stack);
                    that.emit ('error', new ExchangeError (that.id + ': error invoking method ' + callback.name + ' in _asyncExecute: '+ ex));
                }
            }).catch(function(context, error) {
                try {
                    callback.apply (thisParam, [error]);
                } catch (ex) {
                    console.log (ex.stack);
                    that.emit ('error', new ExchangeError (that.id + ': error invoking method ' + callback.name + ' in _asyncExecute: '+ ex));
                }
            });
        } catch (ex) {
            console.log (ex.stack);
            that.emit ('error', new ExchangeError (that.id + ': error invoking method ' + method.name + ' in _asyncExecute: '+ ex));
        }
    }

}
