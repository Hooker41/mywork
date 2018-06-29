var TradingCore = require('./TradingCore');
var DBHelpers = require('./DBHelpers').DBHelpers;
var PairRanker = require('./PairRanker').PairRanker;

module.exports = (ctrl) => {
  this.dbHelpers = new DBHelpers();
  this.pairRanker = new PairRanker();

  // every pingback from the websocket(s)
  ctrl.storage.streamTick = (stream, streamID) => {
    var btcAry = stream.markets.BTC;

    btcAry.forEach((ele)=>{
      ctrl.btcStream[ele.s] = ele.c;
    });

    ctrl.storage.streams[streamID] = stream;

    if (streamID == 'allMarketTickers') {
      // Run logic to check for arbitrage opportunities
      ctrl.storage.candidates = ctrl.currencyCore.getDynamicCandidatesFromStream(stream, ctrl.options.arbitrage);
      
      if(ctrl.storage.candidates.length > 0){
        // Run logic to check for each pairs ranking
        var pairToTrade = this.pairRanker.getPairRanking(ctrl.storage.candidates, ctrl.storage.pairRanks, ctrl, ctrl.logger);
        if (pairToTrade != 'none') {
          
        }

        // queue potential trades
        if (this.tradingCore)
          this.tradingCore.updateCandidateQueue(stream, ctrl.storage.candidates, ctrl.storage.trading.queue);

        // update UI with latest values per currency
        // ctrl.UI.updateArbitageOpportunities(ctrl.storage.candidates);

        if (ctrl.options.storage.logHistory) {
          // Log arbitrage data to DB, if enabled
          this.dbHelpers.saveArbRows(ctrl.storage.candidates, ctrl.storage.db, ctrl.logger);
          this.dbHelpers.saveRawTick(stream.arr, ctrl.storage.db, ctrl.logger);
        }
      }
      else{
        console.log("Can't find the Opportunities");
      }
    }
  };

  // loading the CurrencyCore starts the streams
  ctrl.logger.info('--- Starting Currency Streams');
  ctrl.currencyCore = require('./CurrencyCore')(ctrl);

  this.tradingCore = TradingCore(ctrl.options.trading, ctrl.currencyCore);
  // use this for callbacks for ongoing trade workflows
  // this.tradingCore.on('queueUpdated', (queue, timeStarted)=>{ 
  //   console.log('QUEUEUPDATED');
  //  });

  this.tradingCore.on('newTradeQueued', async (pairToTrade, timeStarted)=>{ 

    // console.log(ctrl.btcStream['BTCUSDT']);
    if( ctrl.running )
      return;

    console.log('======Start=========');
    ctrl.running = true;

    var btcUSD = ctrl.btcStream['BTCUSDT'];
    //=========================================================
    const aInfo = pairToTrade.a;
    const aTradeInfo = aInfo.tradeInfo;
    console.log(aTradeInfo, aInfo.stepFrom, aInfo.stepTo);
    var headPair1 = aTradeInfo.symbol.startsWith(aInfo.stepFrom) ? aInfo.stepFrom : aInfo.stepTo;
    var price1 = btcUSD * ctrl.btcStream[headPair1 + 'BTC'];
    var tradeQty1 = getTradeQty(aTradeInfo.symbol, 15 / price1, price1);
    console.log('Qty : ', tradeQty1);
    try{
      await snooze(70);
      var res1 = await ctrl.exchange.newOrder({  symbol:aTradeInfo.symbol,
                                side: 'BUY',
                                type: aTradeInfo.type,
                                quantity: tradeQty1,
                                timestamp: new Date().getTime() });
    }catch(error){ console.log(error); ctrl.running = false; return;};
    console.log(res1.symbol, res1.status);
    // =========================================================
    const bInfo = pairToTrade.b;
    const bTradeInfo = bInfo.tradeInfo;
    console.log(bTradeInfo, bInfo.stepFrom, bInfo.stepTo);
    var headPair2 = bTradeInfo.symbol.startsWith(bInfo.stepTo) ? bInfo.stepTo : bInfo.stepFrom;
    var price2 = btcUSD * ctrl.btcStream[headPair2 + 'BTC'];
    var tradeQty2 = getTradeQty(bTradeInfo.symbol, 15 / price2, price2);
    console.log('Qty : ', tradeQty2);
    try{
      await snooze(70);
      var res2 = await ctrl.exchange.newOrder({  symbol:bTradeInfo.symbol,
                                side: 'BUY',
                                type: bTradeInfo.type,
                                quantity: tradeQty2,
                                timestamp: new Date().getTime() });
    }catch(error){ console.log(error); ctrl.running = false; return;};
    console.log(res2.symbol, res2.status);
    //=========================================================
    const cInfo = pairToTrade.c;
    const cTradeInfo = cInfo.tradeInfo;
    console.log(cTradeInfo, cInfo.stepFrom, cInfo.stepTo);
    var headPair3 = cTradeInfo.symbol.startsWith(cInfo.stepFrom) ? cInfo.stepFrom : cInfo.stepTo;
    var price3 = btcUSD * ctrl.btcStream[headPair3 + 'BTC'];
    var tradeQty3 = getTradeQty(cTradeInfo.symbol, 15 / price3, price3);
    console.log('Qty : ', tradeQty3);
    try{
      await snooze(70);
      var res3 = await ctrl.exchange.newOrder({  symbol:cTradeInfo.symbol,
                                side: 'SELL',
                                type: cTradeInfo.type,
                                quantity: tradeQty3,
                                timestamp: new Date().getTime() });
    }catch(error){ console.log(error); ctrl.running = false; return;};
    console.log(res3.symbol, res3.status);
    console.log('======END==========');
    ctrl.running = false;
  });

  getTradeQty = (pair, tradeQty, price) => {
    var filter = getCoinRules( pair );
    var stepsize = filter[1]['stepSize'];
    
    if(( price * tradeQty )  < parseFloat(filter[2]['minNotional'])) return 0;
    
    if( tradeQty <= parseFloat(filter[1]['minQty']) || tradeQty >= parseFloat(filter[1]['maxQty']) ) return 0;

    let lotSize = ( tradeQty - filter[1]['minQty'] ) % parseFloat(stepsize) == 0;

    if(!lotSize && stepsize) {
      let stepSize = stepsize.split(".");
      let step = stepSize[1].indexOf(1);
      tradeQty = (parseFloat(tradeQty.toFixed( step + 1 )));
    }

    return tradeQty;
  }

  getCoinRules = ( pair ) => {
    var rules = ctrl.storage.rule;
    var pairRule = rules.filter(e => (e.symbol === pair));
    return pairRule[0].filters;
  }

  snooze = ms => new Promise(resolve => setTimeout(resolve, ms));

};
