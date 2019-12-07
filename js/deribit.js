'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { TICK_SIZE } = require ('./base/functions/number');
const { AuthenticationError, ExchangeError, ArgumentsRequired, PermissionDenied, InvalidOrder, OrderNotFound, DDoSProtection, NotSupported, ExchangeNotAvailable, InsufficientFunds } = require ('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class deribit extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'deribit',
            'name': 'Deribit',
            'countries': [ 'NL' ], // Netherlands
            'version': 'v2',
            'userAgent': undefined,
            'rateLimit': 2000,
            'has': {
                'CORS': true,
                'fetchOHLCV': true,
                'editOrder': true,
                'fetchOrder': true,
                'fetchOrders': false,
                'fetchOpenOrders': true,
                'fetchClosedOrders': true,
                'fetchMyTrades': true,
                'fetchTickers': false,
            },
            'timeframes': {
                '1m': '1m',
                '3m': '3m',
                '5m': '5m',
                '15m': '15m',
                '30m': '30m',
                '1h': '1h',
                '2h': '2h',
                '4h': '4h',
                '6h': '6h',
                '8h': '8h',
                '12h': '12h',
                '1d': '1d',
                '3d': '3d',
                '1w': '1w',
                '1M': '1M',
            },
            'urls': {
                'test': 'https://test.deribit.com',
                'logo': 'https://user-images.githubusercontent.com/1294454/41933112-9e2dd65a-798b-11e8-8440-5bab2959fcb8.jpg',
                'api': 'https://www.deribit.com',
                'www': 'https://www.deribit.com',
                'doc': [
                    'https://docs.deribit.com',
                    'https://github.com/deribit',
                ],
                'fees': 'https://www.deribit.com/pages/information/fees',
                'referral': 'https://www.deribit.com/reg-1189.4038',
            },
            'api': {
                'public': {
                    'get': [
                        'ping',
                        'test',
                        'getinstruments',
                        'index',
                        'getcurrencies',
                        'getorderbook',
                        'getlasttrades',
                        'getsummary',
                        'stats',
                        'getannouncments',
                        'get_tradingview_chart_data'
                    ],
                },
                'private': {
                    'get': [
                        'account',
                        'getopenorders',
                        'positions',
                        'orderhistory',
                        'orderstate',
                        'tradehistory',
                        'newannouncements',
                    ],
                    'post': [
                        'buy',
                        'sell',
                        'edit',
                        'cancel',
                        'cancelall',
                    ],
                },
            },
            'wsconf': {
                'conx-tpls': {
                    'default': {
                        'type': 'ws',
                        'testurl': 'wss://testapp.deribit.com/ws/api/v2',
                        'baseurl': 'wss://www.deribit.com/ws/api/v2/',
                    },
                },
                'methodmap': {
                    '_websocketTimeoutSendPing': '_websocketTimeoutSendPing',
                    '_websocketTimeoutRemoveNonce': '_websocketTimeoutRemoveNonce',
                    '_websocketTimeoutPong': '_websocketTimeoutPong',
                },
                'events': {
                    'ob': {
                        'conx-tpl': 'default',
                        'conx-param': {
                            'url': '{baseurl}',
                            'id': '{id}',
                        },
                    },
                    'trade': {
                        'conx-tpl': 'default',
                        'conx-param': {
                            'url': '{baseurl}',
                            'id': '{id}',
                        },
                    },
                },
            },
            'exceptions': {
                // 0 or absent Success, No error
                '9999': PermissionDenied,   // "api_not_enabled" User didn't enable API for the Account
                '10000': AuthenticationError,  // "authorization_required" Authorization issue, invalid or absent signature etc
                '10001': ExchangeError,     // "error" Some general failure, no public information available
                '10002': InvalidOrder,      // "qty_too_low" Order quantity is too low
                '10003': InvalidOrder,      // "order_overlap" Rejection, order overlap is found and self-trading is not enabled
                '10004': OrderNotFound,     // "order_not_found" Attempt to operate with order that can't be found by specified id
                '10005': InvalidOrder,      // "price_too_low <Limit>" Price is too low, <Limit> defines current limit for the operation
                '10006': InvalidOrder,      // "price_too_low4idx <Limit>" Price is too low for current index, <Limit> defines current bottom limit for the operation
                '10007': InvalidOrder, // "price_too_high <Limit>" Price is too high, <Limit> defines current up limit for the operation
                '10008': InvalidOrder, // "price_too_high4idx <Limit>" Price is too high for current index, <Limit> defines current up limit for the operation
                '10009': InsufficientFunds, // "not_enough_funds" Account has not enough funds for the operation
                '10010': OrderNotFound, // "already_closed" Attempt of doing something with closed order
                '10011': InvalidOrder, // "price_not_allowed" This price is not allowed for some reason
                '10012': InvalidOrder, // "book_closed" Operation for instrument which order book had been closed
                '10013': PermissionDenied, // "pme_max_total_open_orders <Limit>" Total limit of open orders has been exceeded, it is applicable for PME users
                '10014': PermissionDenied, // "pme_max_future_open_orders <Limit>" Limit of count of futures' open orders has been exceeded, it is applicable for PME users
                '10015': PermissionDenied, // "pme_max_option_open_orders <Limit>" Limit of count of options' open orders has been exceeded, it is applicable for PME users
                '10016': PermissionDenied, // "pme_max_future_open_orders_size <Limit>" Limit of size for futures has been exceeded, it is applicable for PME users
                '10017': PermissionDenied, // "pme_max_option_open_orders_size <Limit>" Limit of size for options has been exceeded, it is applicable for PME users
                '10019': PermissionDenied, // "locked_by_admin" Trading is temporary locked by admin
                '10020': ExchangeError, // "invalid_or_unsupported_instrument" Instrument name is not valid
                '10022': InvalidOrder, // "invalid_quantity" quantity was not recognized as a valid number
                '10023': InvalidOrder, // "invalid_price" price was not recognized as a valid number
                '10024': InvalidOrder, // "invalid_max_show" max_show parameter was not recognized as a valid number
                '10025': InvalidOrder, // "invalid_order_id" Order id is missing or its format was not recognized as valid
                '10026': InvalidOrder, // "price_precision_exceeded" Extra precision of the price is not supported
                '10027': InvalidOrder, // "non_integer_contract_amount" Futures contract amount was not recognized as integer
                '10028': DDoSProtection, // "too_many_requests" Allowed request rate has been exceeded
                '10029': OrderNotFound, // "not_owner_of_order" Attempt to operate with not own order
                '10030': ExchangeError, // "must_be_websocket_request" REST request where Websocket is expected
                '10031': ExchangeError, // "invalid_args_for_instrument" Some of arguments are not recognized as valid
                '10032': InvalidOrder, // "whole_cost_too_low" Total cost is too low
                '10033': NotSupported, // "not_implemented" Method is not implemented yet
                '10034': InvalidOrder, // "stop_price_too_high" Stop price is too high
                '10035': InvalidOrder, // "stop_price_too_low" Stop price is too low
                '11035': InvalidOrder, // "no_more_stops <Limit>" Allowed amount of stop orders has been exceeded
                '11036': InvalidOrder, // "invalid_stoppx_for_index_or_last" Invalid StopPx (too high or too low) as to current index or market
                '11037': InvalidOrder, // "outdated_instrument_for_IV_order" Instrument already not available for trading
                '11038': InvalidOrder, // "no_adv_for_futures" Advanced orders are not available for futures
                '11039': InvalidOrder, // "no_adv_postonly" Advanced post-only orders are not supported yet
                '11040': InvalidOrder, // "impv_not_in_range 0..499%" Implied volatility is out of allowed range
                '11041': InvalidOrder, // "not_adv_order" Advanced order properties can't be set if the order is not advanced
                '11042': PermissionDenied, // "permission_denied" Permission for the operation has been denied
                '11044': OrderNotFound, // "not_open_order" Attempt to do open order operations with the not open order
                '11045': ExchangeError, // "invalid_event" Event name has not been recognized
                '11046': ExchangeError, // "outdated_instrument" At several minutes to instrument expiration, corresponding advanced implied volatility orders are not allowed
                '11047': ExchangeError, // "unsupported_arg_combination" The specified combination of arguments is not supported
                '11048': ExchangeError, // "not_on_this_server" The requested operation is not available on this server.
                '11050': ExchangeError, // "invalid_request" Request has not been parsed properly
                '11051': ExchangeNotAvailable, // "system_maintenance" System is under maintenance
                '11030': ExchangeError, // "other_reject <Reason>" Some rejects which are not considered as very often, more info may be specified in <Reason>
                '11031': ExchangeError, // "other_error <Error>" Some errors which are not considered as very often, more info may be specified in <Error>
            },
            'precisionMode': TICK_SIZE,
            'options': {
                'fetchTickerQuotes': true,
            },
        });
    }

    async fetchMarkets (params = {}) {
        const response = await this.publicGetGetinstruments (params);
        const markets = this.safeValue (response, 'result');
        const result = [];
        for (let i = 0; i < markets.length; i++) {
            const market = markets[i];
            const id = this.safeString (market, 'instrumentName');
            const baseId = this.safeString (market, 'baseCurrency');
            const quoteId = this.safeString (market, 'currency');
            const base = this.safeCurrencyCode (baseId);
            const quote = this.safeCurrencyCode (quoteId);
            const type = this.safeString (market, 'kind');
            const future = (type === 'future');
            const option = (type === 'option');
            const active = this.safeValue (market, 'isActive');
            const precision = {
                'amount': this.safeFloat (market, 'minTradeAmount'),
                'price': this.safeFloat (market, 'tickSize'),
            };
            result.push ({
                'id': id,
                'symbol': id,
                'base': base,
                'quote': quote,
                'active': active,
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': this.safeFloat (market, 'minTradeAmount'),
                        'max': undefined,
                    },
                    'price': {
                        'min': this.safeFloat (market, 'tickSize'),
                        'max': undefined,
                    },
                    'cost': {
                        'min': undefined,
                        'max': undefined,
                    },
                },
                'type': type,
                'spot': false,
                'future': future,
                'option': option,
                'info': market,
            });
        }
        return result;
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        const response = await this.privateGetAccount (params);
        //
        //     {
        //         "usOut":1569048827943520,
        //         "usIn":1569048827943020,
        //         "usDiff":500,
        //         "testnet":false,
        //         "success":true,
        //         "result":{
        //             "equity":2e-9,
        //             "maintenanceMargin":0.0,
        //             "initialMargin":0.0,
        //             "availableFunds":0.0,
        //             "balance":0.0,
        //             "marginBalance":0.0,
        //             "SUPL":0.0,
        //             "SRPL":0.0,
        //             "PNL":0.0,
        //             "optionsPNL":0.0,
        //             "optionsSUPL":0.0,
        //             "optionsSRPL":0.0,
        //             "optionsD":0.0,
        //             "optionsG":0.0,
        //             "optionsV":0.0,
        //             "optionsTh":0.0,
        //             "futuresPNL":0.0,
        //             "futuresSUPL":0.0,
        //             "futuresSRPL":0.0,
        //             "deltaTotal":0.0,
        //             "sessionFunding":0.0,
        //             "depositAddress":"13tUtNsJSZa1F5GeCmwBywVrymHpZispzw",
        //             "currency":"BTC"
        //         },
        //         "message":""
        //     }
        //
        const result = {
            'info': response,
        };
        const balance = this.safeValue (response, 'result', {});
        const currencyId = this.safeString (balance, 'currency');
        const code = this.safeCurrencyCode (currencyId);
        const account = this.account ();
        account['free'] = this.safeFloat (balance, 'availableFunds');
        account['used'] = this.safeFloat (balance, 'maintenanceMargin');
        account['total'] = this.safeFloat (balance, 'equity');
        result[code] = account;
        return this.parseBalance (result);
    }

    async fetchOHLCV(symbol, timeframe = '1m', since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets();
        const market = this.market(symbol);
        const duration = this.parseTimeframe(timeframe) / 60;
        const request = {
            'instrument_name': market['id'],
            'resolution': duration,
            'start_timestamp': Date.now() - duration * 60 * 1000,     // true == include yet-incomplete current bins
            'end_timestamp': Date.now(),     // true == include yet-incomplete current bins
        };
        if (limit !== undefined) {
            request['start_timestamp'] -= (duration * (limit - 2) * 60 * 1000); // default 100, max 500
        }
        if (since !== undefined) {
            request['start_timestamp'] = since; // starting date filter for results
        }
        const response = await this.public_get_get_tradingview_chart_data(this.extend(request, params));
        const result = [];
        response.result.ticks.forEach((tick, index)=>{
            let candle = [];
            candle.push(tick);
            candle.push(response.result.open[index]);
            candle.push(response.result.high[index]);
            candle.push(response.result.low[index]);
            candle.push(response.result.close[index]);
            candle.push(response.result.volume[index]);
            result.push(candle);
        });
        return result;
    }

    async fetchDepositAddress (code, params = {}) {
        await this.loadMarkets ();
        const currency = this.currency (code);
        const request = {
            'currency': currency['id'],
        };
        const response = await this.privateGetAccount (this.extend (request, params));
        const result = this.safeValue (response, 'result', {});
        const address = this.safeString (result, 'depositAddress');
        return {
            'currency': code,
            'address': address,
            'tag': undefined,
            'info': response,
        };
    }

    parseTicker (ticker, market = undefined) {
        const timestamp = this.safeInteger (ticker, 'created');
        const symbol = this.findSymbol (this.safeString (ticker, 'instrumentName'), market);
        const last = this.safeFloat (ticker, 'last');
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': this.safeFloat (ticker, 'high'),
            'low': this.safeFloat (ticker, 'low'),
            'bid': this.safeFloat (ticker, 'bidPrice'),
            'bidVolume': undefined,
            'ask': this.safeFloat (ticker, 'askPrice'),
            'askVolume': undefined,
            'vwap': undefined,
            'open': undefined,
            'close': last,
            'last': last,
            'previousClose': undefined,
            'change': undefined,
            'percentage': undefined,
            'average': undefined,
            'baseVolume': undefined,
            'quoteVolume': this.safeFloat (ticker, 'volume'),
            'info': ticker,
        };
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'instrument': market['id'],
        };
        const response = await this.publicGetGetsummary (this.extend (request, params));
        return this.parseTicker (response['result'], market);
    }

    parseTrade (trade, market = undefined) {
        //
        // fetchTrades (public)
        //
        //     {
        //         "tradeId":23197559,
        //         "instrument":"BTC-28JUN19",
        //         "timeStamp":1559643011379,
        //         "tradeSeq":1997200,
        //         "quantity":2,
        //         "amount":20.0,
        //         "price":8010.0,
        //         "direction":"sell",
        //         "tickDirection":2,
        //         "indexPrice":7969.01
        //     }
        //
        // fetchMyTrades (private)
        //
        //     {
        //         "quantity":54,
        //         "amount":540.0,
        //         "tradeId":23087297,
        //         "instrument":"BTC-PERPETUAL",
        //         "timeStamp":1559604178803,
        //         "tradeSeq":8265011,
        //         "price":8213.0,
        //         "side":"sell",
        //         "orderId":12373631800,
        //         "matchingId":0,
        //         "liquidity":"T",
        //         "fee":0.000049312,
        //         "feeCurrency":"BTC",
        //         "tickDirection":3,
        //         "indexPrice":8251.94,
        //         "selfTrade":false
        //     }
        //
        const id = this.safeString (trade, 'tradeId');
        const orderId = this.safeString (trade, 'orderId');
        let symbol = undefined;
        if (market !== undefined) {
            symbol = market['symbol'];
        }
        const timestamp = this.safeInteger (trade, 'timeStamp');
        const side = this.safeString2 (trade, 'side', 'direction');
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'quantity');
        let cost = undefined;
        if (amount !== undefined) {
            if (price !== undefined) {
                cost = amount * price;
            }
        }
        let fee = undefined;
        const feeCost = this.safeFloat (trade, 'fee');
        if (feeCost !== undefined) {
            const feeCurrencyId = this.safeString (trade, 'feeCurrency');
            const feeCurrencyCode = this.safeCurrencyCode (feeCurrencyId);
            fee = {
                'cost': feeCost,
                'currency': feeCurrencyCode,
            };
        }
        return {
            'id': id,
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'order': orderId,
            'type': undefined,
            'side': side,
            'takerOrMaker': undefined,
            'price': price,
            'amount': amount,
            'cost': cost,
            'fee': fee,
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'instrument': market['id'],
        };
        if (limit !== undefined) {
            request['limit'] = limit;
        } else {
            request['limit'] = 10000;
        }
        const response = await this.publicGetGetlasttrades (this.extend (request, params));
        //
        //     {
        //         "usOut":1559643108984527,
        //         "usIn":1559643108984470,
        //         "usDiff":57,
        //         "testnet":false,
        //         "success":true,
        //         "result": [
        //             {
        //                 "tradeId":23197559,
        //                 "instrument":"BTC-28JUN19",
        //                 "timeStamp":1559643011379,
        //                 "tradeSeq":1997200,
        //                 "quantity":2,
        //                 "amount":20.0,
        //                 "price":8010.0,
        //                 "direction":"sell",
        //                 "tickDirection":2,
        //                 "indexPrice":7969.01
        //             }
        //         ],
        //         "message":""
        //     }
        //
        const result = this.safeValue (response, 'result', []);
        return this.parseTrades (result, market, since, limit);
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'instrument': market['id'],
        };
        const response = await this.publicGetGetorderbook (this.extend (request, params));
        const timestamp = this.safeInteger (response, 'usOut') / 1000;
        const orderbook = this.parseOrderBook (response['result'], timestamp, 'bids', 'asks', 'price', 'quantity');
        return this.extend (orderbook, {
            'nonce': this.safeInteger (response, 'tstamp'),
        });
    }

    parseOrderStatus (status) {
        const statuses = {
            'open': 'open',
            'cancelled': 'canceled',
            'filled': 'closed',
        };
        return this.safeString (statuses, status, status);
    }

    parseOrder (order, market = undefined) {
        //
        //     {
        //         "orderId": 5258039,          // ID of the order
        //         "type": "limit",             // not documented, but present in the actual response
        //         "instrument": "BTC-26MAY17", // instrument name (market id)
        //         "direction": "sell",         // order direction, "buy" or "sell"
        //         "price": 1860,               // float, USD for futures, BTC for options
        //         "label": "",                 // label set by the owner, up to 32 chars
        //         "quantity": 10,              // quantity, in contracts ($10 per contract for futures, ฿1 — for options)
        //         "filledQuantity": 3,         // filled quantity, in contracts ($10 per contract for futures, ฿1 — for options)
        //         "avgPrice": 1860,            // average fill price of the order
        //         "commission": -0.000001613,  // in BTC units
        //         "created": 1494491899308,    // creation timestamp
        //         "state": "open",             // open, cancelled, etc
        //         "postOnly": false            // true for post-only orders only
        // open orders --------------------------------------------------------
        //         "lastUpdate": 1494491988754, // timestamp of the last order state change (before this cancelorder of course)
        // closed orders ------------------------------------------------------
        //         "tstamp": 1494492913288,     // timestamp of the last order state change, documented, but may be missing in the actual response
        //         "modified": 1494492913289,   // timestamp of the last db write operation, e.g. trade that doesn't change order status, documented, but may missing in the actual response
        //         "adv": false                 // advanced type (false, or "usd" or "implv")
        //         "trades": [],                // not documented, injected from the outside of the parseOrder method into the order
        //     }
        //
        const timestamp = this.safeInteger (order, 'created');
        const lastUpdate = this.safeInteger (order, 'lastUpdate');
        let lastTradeTimestamp = this.safeInteger2 (order, 'tstamp', 'modified');
        const id = this.safeString (order, 'orderId');
        const price = this.safeFloat (order, 'price');
        const average = this.safeFloat (order, 'avgPrice');
        const amount = this.safeFloat (order, 'quantity');
        const filled = this.safeFloat (order, 'filledQuantity');
        if (lastTradeTimestamp === undefined) {
            if (filled !== undefined) {
                if (filled > 0) {
                    lastTradeTimestamp = lastUpdate;
                }
            }
        }
        let remaining = undefined;
        let cost = undefined;
        if (filled !== undefined) {
            if (amount !== undefined) {
                remaining = amount - filled;
            }
            if (price !== undefined) {
                cost = price * filled;
            }
        }
        const status = this.parseOrderStatus (this.safeString (order, 'state'));
        const side = this.safeStringLower (order, 'direction');
        let feeCost = this.safeFloat (order, 'commission');
        if (feeCost !== undefined) {
            feeCost = Math.abs (feeCost);
        }
        const fee = {
            'cost': feeCost,
            'currency': 'BTC',
        };
        const type = this.safeString (order, 'type');
        const marketId = this.safeString (order, 'instrument');
        let symbol = undefined;
        if (marketId in this.markets_by_id) {
            market = this.markets_by_id[marketId];
            symbol = market['symbol'];
        }
        return {
            'info': order,
            'id': id,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': lastTradeTimestamp,
            'symbol': symbol,
            'type': type,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': cost,
            'average': average,
            'filled': filled,
            'remaining': remaining,
            'status': status,
            'fee': fee,
            'trades': undefined, // todo: parse trades
        };
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {
            'orderId': id,
        };
        const response = await this.privateGetOrderstate (this.extend (request, params));
        const result = this.safeValue (response, 'result');
        if (result === undefined) {
            throw new OrderNotFound (this.id + ' fetchOrder() ' + this.json (response));
        }
        return this.parseOrder (result);
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {
            'instrument': this.marketId (symbol),
            'quantity': amount,
            'type': type,
            // 'post_only': 'false' or 'true', https://github.com/ccxt/ccxt/issues/5159
        };
        if (price !== undefined) {
            request['price'] = price;
        }
        const method = 'privatePost' + this.capitalize (side);
        const response = await this[method] (this.extend (request, params));
        const order = this.safeValue (response['result'], 'order');
        if (order === undefined) {
            return response;
        }
        return this.parseOrder (order);
    }

    async editOrder (id, symbol, type, side, amount = undefined, price = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {
            'orderId': id,
        };
        if (amount !== undefined) {
            request['quantity'] = amount;
        }
        if (price !== undefined) {
            request['price'] = price;
        }
        const response = await this.privatePostEdit (this.extend (request, params));
        return this.parseOrder (response['result']['order']);
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {
            'orderId': id,
        };
        const response = await this.privatePostCancel (this.extend (request, params));
        return this.parseOrder (response['result']['order']);
    }

    async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchClosedOrders() requires a `symbol` argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'instrument': market['id'],
        };
        const response = await this.privateGetGetopenorders (this.extend (request, params));
        return this.parseOrders (response['result'], market, since, limit);
    }

    async fetchClosedOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchClosedOrders() requires a `symbol` argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'instrument': market['id'],
        };
        const response = await this.privateGetOrderhistory (this.extend (request, params));
        return this.parseOrders (response['result'], market, since, limit);
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'instrument': market['id'],
        };
        if (limit !== undefined) {
            request['count'] = limit; // default = 20
        }
        const response = await this.privateGetTradehistory (this.extend (request, params));
        //
        //     {
        //         "usOut":1559611553394836,
        //         "usIn":1559611553394000,
        //         "usDiff":836,
        //         "testnet":false,
        //         "success":true,
        //         "result": [
        //             {
        //                 "quantity":54,
        //                 "amount":540.0,
        //                 "tradeId":23087297,
        //                 "instrument":"BTC-PERPETUAL",
        //                 "timeStamp":1559604178803,
        //                 "tradeSeq":8265011,
        //                 "price":8213.0,
        //                 "side":"sell",
        //                 "orderId":12373631800,
        //                 "matchingId":0,
        //                 "liquidity":"T",
        //                 "fee":0.000049312,
        //                 "feeCurrency":"BTC",
        //                 "tickDirection":3,
        //                 "indexPrice":8251.94,
        //                 "selfTrade":false
        //             }
        //         ],
        //         "message":"",
        //         "has_more":true
        //     }
        //
        const trades = this.safeValue (response, 'result', []);
        return this.parseTrades (trades, market, since, limit);
    }

    nonce () {
        return this.milliseconds ();
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        const query = '/' + 'api/' + this.version + '/' + api + '/' + path;
        let url = this.urls['api'] + query;
        if (api === 'public') {
            if (Object.keys (params).length) {
                url += '?' + this.urlencode (params);
            }
        } else {
            this.checkRequiredCredentials ();
            const nonce = this.nonce ().toString ();
            let auth = '_=' + nonce + '&_ackey=' + this.apiKey + '&_acsec=' + this.secret + '&_action=' + query;
            if (Object.keys (params).length) {
                params = this.keysort (params);
                auth += '&' + this.urlencode (params);
            }
            const hash = this.hash (this.encode (auth), 'sha256', 'base64');
            const signature = this.apiKey + '.' + nonce + '.' + this.decode (hash);
            headers = {
                'x-deribit-sig': signature,
            };
            if (method !== 'GET') {
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
                body = this.urlencode (params);
            } else if (Object.keys (params).length) {
                url += '?' + this.urlencode (params);
            }
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    handleErrors (httpCode, reason, url, method, headers, body, response, requestHeaders, requestBody) {
        if (!response) {
            return; // fallback to default error handler
        }
        //
        //     {"usOut":1535877098645376,"usIn":1535877098643364,"usDiff":2012,"testnet":false,"success":false,"message":"order_not_found","error":10004}
        //
        const error = this.safeString (response, 'error');
        if ((error !== undefined) && (error !== '0')) {
            const feedback = this.id + ' ' + body;
            const exceptions = this.exceptions;
            if (error in exceptions) {
                throw new exceptions[error] (feedback);
            }
            throw new ExchangeError (feedback); // unknown message
        }
    }

    _websocketOnOpen(contextId, websocketOptions) { // eslint-disable-line no-unused-vars
        this._websocketRestartPingTimer(contextId);
        const dbids = {};
        this._contextSet(contextId, 'dbids', dbids);
        // send auth
        // let nonce = this.nonce ();
        // let signature = this.hmac (this.encode ('GET/realtime' + nonce.toString ()), this.encode (this.secret));
        // let payload = {
        //     'op': 'authKeyExpires',
        //     'args': [this.apiKey, nonce, signature]
        //  };
        // this.asyncSendJson (payload);
    }

    _websocketOnMessage(contextId, data) {
        this._websocketRestartPingTimer(contextId);
        const msg = JSON.parse(data);
        if(msg.result){
            this._websocketHandleSubscription(contextId, msg);
        }
        else if(msg.params && msg.params.channel.indexOf("book") > -1){
            this._websocketHandleOb(contextId, msg);
        }
        else if(msg.error){
            this._websocketHandleError(contextId, msg.error);
        }
    }

    _websocketOnPong(contextId, sequence) {
        console.log('PONG ' + sequence);
        const sequenceStr = '_' + sequence.toString();
        const pongTimers = this._contextGet(contextId, 'pongtimers');
        if (sequenceStr in pongTimers) {
            const timer = pongTimers[sequenceStr];
            this._cancelTimeout(timer);
            this.omit(pongTimers, sequenceStr);
            this._contextSet(contextId, 'pongtimers', pongTimers);
        }
        this._websocketRestartPingTimer(contextId);
    }

    _websocketTimeoutSendPing(contextId) {
        let lastSeq = this._contextGet(contextId, 'pingseq');
        if (typeof lastSeq === 'undefined') {
            lastSeq = 1;
        } else {
            lastSeq = this.sum(lastSeq, 1);
        }
        const sequenceStr = '_' + lastSeq.toString();
        console.log('PING ' + lastSeq);
        this._contextSet(contextId, 'pingseq', lastSeq);
        this.websocketSendPing(lastSeq);
        let pongTimers = this._contextGet(contextId, 'pongtimers');
        if (typeof pongTimers === 'undefined') {
            pongTimers = [];
        }
        const newPongTimer = this._setTimeout(contextId, 5000, this._websocketMethodMap('_websocketTimeoutPong'), [contextId, lastSeq]);
        pongTimers[sequenceStr] = newPongTimer;
        this._contextSet(contextId, 'pongtimers', pongTimers);
    }

    _websocketTimeoutPong(contextId, sequence) {
        this.emit('err', new ExchangeError(this.id + ' no pong received for ' + sequence), contextId);
    }

    _websocketHandleError(contextId, msg) {
        const status = this.safeInteger(msg, 'code');
        const error = this.safeString(msg, 'message');
        this.emit('err', new ExchangeError(this.id + ' status ' + status + ':' + error), contextId);
    }

    _websocketRestartPingTimer(contextId) {
        // reset ping timer
        let lastTimer = this._contextGet(contextId, 'timer');
        if (typeof lastTimer !== 'undefined') {
            this._cancelTimeout(lastTimer);
        }
        lastTimer = this._setTimeout(contextId, 6000, this._websocketMethodMap('_websocketTimeoutSendPing'), [contextId]);
        this._contextSet(contextId, 'timer', lastTimer);
    }

    _websocketOnClose(contextId) {
        let lastTimer = this._contextGet(contextId, 'timer');
        if (typeof lastTimer !== 'undefined') {
            this._cancelTimeout(lastTimer);
        }
        lastTimer = undefined;
        this._contextSet(contextId, 'timer', lastTimer);
    }

    _websocketHandleSubscription(contextId, msg) {
        const parts = msg.result[0].split('.');
        const partsLen = parts.length;
        let event = undefined;
        if (parts[0] === 'book') {
            event = 'ob';
        } else if (parts[0] === 'trade') {
            event = 'trade';
        } else {
            event = undefined;
        }
        if (typeof event !== 'undefined') {
            const symbol = this.findSymbol(parts[1]);
            const symbolData = this._contextGetSymbolData(contextId, event, symbol);
            if ('sub-nonces' in symbolData) {
                const nonces = symbolData['sub-nonces'];
                const keys = Object.keys(nonces);
                for (let i = 0; i < keys.length; i++) {
                    const nonce = keys[i];
                    this._cancelTimeout(nonces[nonce]);
                    this.emit(nonce, 200);
                }
                symbolData['sub-nonces'] = {};
                this._contextSetSymbolData(contextId, event, symbol, symbolData);
            }
        }
    }

    _websocketHandleUnsubscription(contextId, msg) {
        const success = this.safeValue(msg, 'success');
        const unsubscribe = this.safeString(msg, 'unsubscribe');
        const parts = unsubscribe.split(':');
        const partsLen = parts.length;
        let event = undefined;
        if (partsLen === 2) {
            if (parts[0] === 'orderBookL2') {
                event = 'ob';
            } else if (parts[0] === 'trade') {
                event = 'trade';
            } else {
                event = undefined;
            }
            if (typeof event !== 'undefined') {
                const symbol = this.findSymbol(parts[1]);
                if (success && event === 'ob') {
                    const dbids = this._contextGet(contextId, 'dbids');
                    if (symbol in dbids) {
                        this.omit(dbids, symbol);
                        this._contextSet(contextId, 'dbids', dbids);
                    }
                }
                const symbolData = this._contextGetSymbolData(contextId, event, symbol);
                if ('unsub-nonces' in symbolData) {
                    const nonces = symbolData['unsub-nonces'];
                    const keys = Object.keys(nonces);
                    for (let i = 0; i < keys.length; i++) {
                        const nonce = keys[i];
                        this._cancelTimeout(nonces[nonce]);
                        this.emit(nonce, success);
                    }
                    symbolData['unsub-nonces'] = {};
                    this._contextSetSymbolData(contextId, event, symbol, symbolData);
                }
            }
        }
    }

    _websocketHandleTrade(contextId, msg) {
        const data = this.safeValue(msg, 'data');
        const dataLength = data.length;
        if (typeof data === 'undefined' || dataLength === 0) {
            return;
        }
        let symbol = this.safeString(data[0], 'symbol');
        const trades = this.parseTrades(data);
        symbol = this.findSymbol(symbol);
        for (let t = 0; t < trades.length; t++) {
            this.emit('trade', symbol, trades[t]);
        }
    }

    _websocketHandleOb(contextId, msg) {
        const data = msg.params.data;
        let symbol = data.instrument_name;
        const dbids = this._contextGet(contextId, 'dbids');
        symbol = this.findSymbol(symbol);
        const ob = {
            'bids': data.bids,
            'asks': data.asks,
            'timestamp': data.timestamp,
            'datetime': new Date(),
            'nonce': data.change_id,
        };
        // const symbolData = this._contextGetSymbolData(contextId, 'ob', symbol);
        // symbolData['ob'] = ob;
        // dbids[symbol] = obIds;
        // this.emit('ob', symbol, this._cloneOrderBook(ob, symbolData['limit']));
        this.emit('ob', symbol, ob);
        this._contextSet(contextId, 'dbids', dbids);
        this._contextSetSymbolData(contextId, 'ob', symbol, {ob});
    }

    _websocketSubscribe(contextId, event, symbol, nonce, params = {}) {
        if (event !== 'ob' && event !== 'trade') {
            throw new NotSupported('subscribe ' + event + '(' + symbol + ') not supported for exchange ' + this.id);
        }
        const symbolData = this._contextGetSymbolData(contextId, event, symbol);
        if (!('sub-nonces' in symbolData)) {
            symbolData['sub-nonces'] = {};
        }
        const id = this.market_id(symbol).toUpperCase();
        let payload = undefined;
        if (event === 'ob') {
            const limit = this.safeInteger(params, 'limit', undefined);
            payload = {
                'method': 'public/subscribe',
                'params': {
                    'channels': ['book.' + id + '.none.' + limit + '.100ms']
                },
                'jsonrpc': '2.0',
                'id': 1
            };
            symbolData['limit'] = limit;
        } else if (event === 'trade') {
            payload = {
                'op': 'subscribe',
                'args': ['trade:' + id],
            };
        }
        const nonceStr = nonce.toString();
        const handle = this._setTimeout(contextId, this.timeout, this._websocketMethodMap('_websocketTimeoutRemoveNonce'), [contextId, nonceStr, event, symbol, 'sub-nonce']);
        symbolData['sub-nonces'][nonceStr] = handle;
        this._contextSetSymbolData(contextId, event, symbol, symbolData);
        this.websocketSendJson(payload);
    }

    _websocketUnsubscribe(contextId, event, symbol, nonce, params = {}) {
        if (event !== 'ob' && event !== 'trade') {
            throw new NotSupported('unsubscribe ' + event + '(' + symbol + ') not supported for exchange ' + this.id);
        }
        const symbolData = this._contextGetSymbolData(contextId, event, symbol);
        if (!('unsub-nonces' in symbolData)) {
            symbolData['unsub-nonces'] = {};
        }
        const id = this.market_id(symbol).toUpperCase();
        let payload = undefined;
        if (event === 'ob') {
            payload = {
                'op': 'unsubscribe',
                'args': ['orderBookL2:' + id],
            };
        } else if (event === 'trade') {
            payload = {
                'op': 'unsubscribe',
                'args': ['trade:' + id],
            };
        }
        const nonceStr = nonce.toString();
        const handle = this._setTimeout(contextId, this.timeout, this._websocketMethodMap('_websocketTimeoutRemoveNonce'), [contextId, nonceStr, event, symbol, 'unsub-nonces']);
        symbolData['unsub-nonces'][nonceStr] = handle;
        this._contextSetSymbolData(contextId, event, symbol, symbolData);
        this.websocketSendJson(payload);
    }

    _websocketTimeoutRemoveNonce(contextId, timerNonce, event, symbol, key) {
        const symbolData = this._contextGetSymbolData(contextId, event, symbol);
        if (key in symbolData) {
            const nonces = symbolData[key];
            if (timerNonce in nonces) {
                this.omit(symbolData[key], timerNonce);
                this._contextSetSymbolData(contextId, event, symbol, symbolData);
            }
        }
    }

    _getCurrentWebsocketOrderbook(contextId, symbol, limit) {
        const data = this._contextGetSymbolData(contextId, 'ob', symbol);
        if (('ob' in data) && (typeof data['ob'] !== 'undefined')) {
            return this._cloneOrderBook(data['ob'], limit);
        }
        return undefined;
    }
};