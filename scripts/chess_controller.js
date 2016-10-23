/*eslint-env browser*/
/* global chrome */

var Bot = function ($) {
    var engine = {},
        b_console = { log : function (a) { } },
        bot_enable_debug = !('update_url' in chrome.runtime.getManifest());
    
    if (bot_enable_debug && console) {
        b_console =  console;
    }

    var g_backgroundEngineValid = true,
        g_backgroundEngine = null,
        g_analyzing = false,
        blob = null;

    function init (afterInit) {
        try {
            $.get("https://raw.githubusercontent.com/recoders/chessbot/master/scripts/garbochess-b.js", {},
                function (workerCode) {
                    blob = new Blob([workerCode], {type : 'javascript/worker'});
                    if (afterInit) {
                        b_console.log('Chess engine load correctly.');
                        afterInit();
                    }
            });
        } catch (error) {
            b_console.log('Chess engine not load correctly.');
            g_backgroundEngineValid = false;
        }
    }

    function EnsureAnalysisStopped() {
        if (g_analyzing && g_backgroundEngine !== null) {
            g_backgroundEngine.terminate();
            g_backgroundEngine = null;
        }
    }

    function MakeMove(move) {
        if (engine.moveFound !== null) {
            engine.moveFound(move);
        } else {
            console.error("Error move:" + move);
        }
    }

    function InitializeBackgroundEngine(success) {
        if (!blob || !g_backgroundEngineValid) {
            return false;
        }

        if (g_backgroundEngine === null) {
            // g_backgroundEngineValid = true;
                try {
                    g_backgroundEngine = new Worker(window.URL.createObjectURL(blob));
                    g_backgroundEngine.onmessage = function (e) {
                        if (e.data.match("^pv") == "pv") {
                            // Ready Move
                            var data_raw = e.data.replace('pv ', '');
                            var data = JSON.parse(data_raw);
                            b_console.log('Next moves: ' + data.humanMoves);
                            MakeMove(data);
                        } else if (e.data.match("^message") == "message") {
                            EnsureAnalysisStopped();
                        } else {
                            // I dont know what could be happened here:
                            // UIPlayMove(GetMoveFromString(e.data), null);
                        }
                    };
                    g_backgroundEngine.error = function (e) {
                        console.error("Error from background worker:" + e.message);
                    };
                    if (success) {
                        success();
                    }
                } catch (error) {
                    g_backgroundEngineValid = false;
                }
        }

        return g_backgroundEngineValid;
    }

    engine.makeMove = function (fen) {
        if (g_backgroundEngine) {
            g_backgroundEngine.postMessage("position " + fen);
            g_backgroundEngine.postMessage("analyze");

        } else {
            InitializeBackgroundEngine(function(){
                g_backgroundEngine.postMessage("position " + fen);
                g_backgroundEngine.postMessage("analyze");
            });
        }
    };

    // Live moves
    var movesMaded = 0;
    var getNextMove = function (movesArray) {
        if (movesArray.length > 0) {
            for(var i = 0; i < movesArray.length; i++) {
                if (i === movesMaded && movesArray[i].innerText !== '' && movesArray[i].innerText.indexOf('0') === -1) {
                    movesMaded++;
                    // b_console.log("Move: " + move);
                    return movesArray[i].innerText.replace('O-O+', 'O-O').replace('х', 'x'); // Sometimes it was happened
                }
            }
        }
        return false;
    };

    function regularMove (move) {
        if (g_backgroundEngine) {
            g_backgroundEngine.postMessage(move);
        } else {
            b_console.error('Engine is stopped. Suggestion cant be possible in live mode without working engine.');
        }
    }

    function analyze() {
        if (g_backgroundEngine) {
            b_console.log('Analyzing started.');
            g_backgroundEngine.postMessage("analyze");
        } else {
            b_console.log('Cant analyze: engine is stopped.');
        }
    }

    engine.makeLiveSuggest = function (movesArray) {
        // Terminate engine
        if (g_backgroundEngine !== null) {
            g_backgroundEngine.terminate();
            g_backgroundEngine = null;
        }
        InitializeBackgroundEngine(function(){
            movesMaded = 0;
            var nextMove = getNextMove(movesArray);
            while (nextMove) {
                regularMove(nextMove);
                nextMove = getNextMove(movesArray);
            }
            analyze();
        });
    };

    engine.moveFound = null;

    init(InitializeBackgroundEngine);
    
    return engine;
}
bot = new Bot(jQuery);

var CookieMonster = function () {
    var cookieMonster = {};
    cookieMonster.get = function ( name ) {
        var cSIndex = document.cookie.indexOf( name );
        if (cSIndex == -1) return false;
        cSIndex = document.cookie.indexOf( name + "=" )
        if (cSIndex == -1) return false;
        var cEIndex = document.cookie.indexOf( ";", cSIndex + ( name + "=" ).length );
        if (cEIndex == -1) cEIndex = document.cookie.length;
        return document.cookie.substring( cSIndex + ( name + "=" ).length, cEIndex );
    };

    cookieMonster.del = function ( name ) {
        if ( getCookie( name )) {
            document.cookie = name + "=; expires=Thu, 01-Jan-70 00:00:01 GMT";
        }
    };

    cookieMonster.set = function ( name, value, expire ) {
        var time = new Date();
        time.setTime( time.getTime() + expire );
        document.cookie = name + "=" + value + "; expires=" + time.toGMTString();
        return true;
    };
    
    return cookieMonster;
}
var cookie = new CookieMonster();

var PageManager = function($, window, cookieManager){
    var page = page || {};
    const CURRENT_BOT_STANDART = 'bot_standart';
    const CURRENT_BOT_LIVE = 'bot_live';
    const CURRENT_BOT_SIMPLE = 'bot_simple';
    const CURRENT_BOT_LICHESS = 'bot_lichess';
    const CURRENT_BOT_CHESSKID_SIMPLE = 'bot_chesskid_simple';
    const CURRENT_BOT_CHESSKID_STANDART = 'bot_chesskid_standart';
    const CURRENT_BOT_COLOR_WHITE = 0;
    const CURRENT_BOT_COLOR_BLACK = 1;
    var currentBot = CURRENT_BOT_STANDART,
        enableSuggestion = true,
        eChessCookie = 'chessbot-echess-enabled',
        liveChessCookie = 'chessbot-live-enabled',
        currentColor = CURRENT_BOT_COLOR_WHITE,
        isBetaDesign = false;

    page.getCurrentFen = function () {
        return $('.moveactions input').val();
    };

    function toggleSuggestionLive(element) {
        enableSuggestion = !enableSuggestion;
        if (enableSuggestion) {
            $('#robot_message').show();
            $('#robot_enabled_message').text('Enabled');
            $(element).children('img').attr('src', 'https://raw.githubusercontent.com/recoders/chessbot/master/images/robot-20.png');
            $greenSquare.show();
            $pinkSquare.show();
            cookieManager.set(liveChessCookie, '1');
        } else {
            $('#robot_message').hide();
            $('#robot_enabled_message').text('Disabled');
            $(element).children('img').attr('src', 'https://raw.githubusercontent.com/recoders/chessbot/master/images/norobot-20.png');
            $greenSquare.hide();
            $pinkSquare.hide();
            cookieManager.set(liveChessCookie, '0');
        }
    }

    function livePagePreparations(engine) {
      var targets;
      switch (currentBot) {
        case CURRENT_BOT_LICHESS:
          targets = '.top .moves turn move';
          break;
        case CURRENT_BOT_CHESSKID_SIMPLE:
          targets = '#moves div.notation .gotomove';
          break;
        default:
          targets = isBetaDesign ? '.game-controls.game.playing div.notationVertical a.gotomove' : '.dijitVisible #moves div.notation .gotomove';
          break;
      }
      
        // Robot icon actions
        $('#robot_message')
            .css('cursor', 'pointer')
            .on('click', function() {
                engine.makeLiveSuggest($(targets));
            });
        
        var clickTarget = '#robot_enabled_message';
        if (isBetaDesign) { clickTarget = "#robot_icon"; }
        
        $(clickTarget)
            .on('click', function(e) {
                toggleSuggestionLive(this);
                return false;
            });

        var previousMovesCount = 0;
        MutationObserverClass = MutationObserver || window.MutationObserver || window.WebKitMutationObserver;
        var observer = new MutationObserverClass(function(mutations, observer) {
            // fired when a mutation occurs
            var currentMovesCount = $(targets).filter(function () {
                return !!this.innerText;
            }).length;
            if (currentMovesCount > 0) {
                if (currentMovesCount != previousMovesCount) {
                    currentColor = currentMovesCount % 2 == 0 ? CURRENT_BOT_COLOR_WHITE : CURRENT_BOT_COLOR_BLACK;
                    previousMovesCount = currentMovesCount;
                    $('#robot_message').text('Thinking...');
                    // Possible new at each fire.
                    // var subtargetName = isBetaDesign ? '.dijitVisible #moves div.notation' : '.dijitVisible #moves div.notation';
                    engine.makeLiveSuggest($(targets));
                }
            } else {
                $('#robot_message').text('Game not available.');
            }
        });

        var observeReadyInterval = setInterval(function(){
          var observeTarget;
          switch (currentBot) {
            case CURRENT_BOT_LICHESS:
              observeTarget = $('.moves');
              break;
            case CURRENT_BOT_LIVE:
              observeTarget = isBetaDesign ? $('#LiveChessTopSideBarTabset .tab-content') : $('#chess_boards');
              break;
            case CURRENT_BOT_CHESSKID_SIMPLE:
              observeTarget = $('#moves');
              break;
          }
          if (observeTarget.length > 0) {
              observer.observe(observeTarget[0], {		
                 subtree: true,
                 attributes: false,
                 childList: true
              });
              clearInterval(observeReadyInterval);
          }
        }, 5000);
        // And go!
        // enableSuggestion = false; // Fix trouble with cookie removing after refresh. // cookieManager.get(liveChessCookie) == '0';
        // toggleSuggestionLive($('#robot_link')[0]);
        
    }
    
    currentBot = CURRENT_BOT_LIVE;
  
    var attachButtonInNewDesign = function(isLive) {
      $('ul.nav-vertical').append('<li nav-item-hide="">'
                                    + '<a id="robot_icon" class="list-item" href="http://re-coders.com/chessbot" target="_blank">'
                                    + '<span class="nav-icon-wrapper">'
                                    + '<img id="robot_img" style="background-color: white;" alt="Chess.bot icon" title="Enabled" src="https://raw.githubusercontent.com/recoders/chessbot/master/images/robot-20.png" />'
                                    + '</span>'
                                    + '<span id="' + (isLive ? 'robot_enabled_message' : 'robot_notice') + '" class="item-label">Enabled</span>'
                                    + '</a></li>');      
    }
    
    page.createLiveBot = function (botEngine, isBeta) {
        isBetaDesign = isBeta == true;
        if (!isBeta) {
            $('#top_bar_settings').after('<span id="robot_enabled_message" title="Switch on/off." style="cursor: pointer; color: #fff; float: right; margin-right: 10px;">Enabled</span>'
                + '<a id="robot_link" href="http://re-coders.com/chessbot" target="_blank">'
                + '<img style="float: right; background-color: white; margin-right: 5px;" alt="Chess.bot icon" src="https://raw.githubusercontent.com/recoders/chessbot/master/images/robot-20.png" /></a>');
            $("#game_container_splitter").before('<img style="float: right; background-color: white; margin-right: 5px;" alt="Chess.bot icon" src="https://raw.githubusercontent.com/recoders/chessbot/master/images/robot-20.png" />'
                + '<span id="robot_message" style="cursor: pointer;font-size: 20px;position: relative;top: -60px;left: 45px;"></span>');
        } else {
          attachButtonInNewDesign(true);
          $("#LiveChessMainContainer").prepend('<div id="robot_message" style="margin-right: 100px; z-index: 1000; position: relative; background-color: white; font-size: 20px; border-radius: 4px; padding: 6px;">Game not available.</div>')
        }
        currentBot = CURRENT_BOT_LIVE;
        livePagePreparations(botEngine);
    }

    page.createSimpleBot = function (botEngine) {
        $('.more').parent().after('<li><span id="robot_message" style="color: #fff; float: right; margin-right: 10px;">Hi there!</span>'
            + '<a id="robot_link" style="background-color: #5d873b;" href="http://re-coders.com/chessbot" title="Switch robot on/off. To open source - right click, then open in new tab.">'
            + '<img style="float: right; background-color: white; margin-right: 5px;" alt="Chess.bot icon" src="https://raw.githubusercontent.com/recoders/chessbot/master/images/robot-20.png" />'
            + '</a></li>');
        currentBot = CURRENT_BOT_SIMPLE;
        livePagePreparations(botEngine);
    }

    page.createLiChessBot = function (botEngine) {
        // LiChess version
        if ($('.lichess_game').hasClass('variant_standard')) {
            $('#topmenu > section:last-child').after('<a id="robot_link" href="http://re-coders.com/chessbot" target="_blank">'
                + '<img style="background-color: white; margin: 5px 5px 0px 0px;" alt="Chess.bot icon" src="https://raw.githubusercontent.com/recoders/chessbot/master/images/robot-20.png" /></a>'
                + '<span id="robot_enabled_message" title="Switch on/off." style="cursor: pointer; color: #fff; position: relative; top: -4px; font-size: 16px;">Enabled</span>');
            $(".lichess_ground > div:first-child").before('<span id="robot_message" style="cursor: pointer; font-size: 20px; background-color: white; border-radius: 5px; padding: 5px;">Bot ready</span>');
            currentBot = CURRENT_BOT_LICHESS;
            livePagePreparations(botEngine);
        }
    }
    
    page.createChessKidBot = function (botEngine) {
      // ChessKid version
      $('.logo').after('<a id="robot_link" href="http://re-coders.com/chessbot" target="_blank"><img style="background-color: white;margin: 0px 2px 0px 10px;width: 38px;vertical-align: middle;border-radius: 4px;" alt="Chess.bot icon" src="https://raw.githubusercontent.com/recoders/chessbot/master/images/robot-20.png"></a>'
        + '<span id="robot_enabled_message" title="Switch on/off." style="vertical-align: middle; cursor: pointer;color: #2c2c2c;margin-right: 10px;background-color: #fff;padding: 10px;border-radius: 2px;font-weight: bold;">Enabled</span>');
      $("#chess_board").before('<span id="robot_message" style="cursor: pointer;font-size: 20px;position: relative;top: -3px;left: 133px;background-color: #fff;padding: 5px 10px;border-radius: 3px;">Bot ready</span>');
        
      currentBot = CURRENT_BOT_CHESSKID_SIMPLE;
      livePagePreparations(botEngine);
    }

    function toggleSuggestionStandart(control) {
      enableSuggestion = !enableSuggestion;
      var ableText = enableSuggestion ? 'Enabled' : 'Disabled';
      var ableIcon = enableSuggestion ? 'robot-20.png' : 'norobot-20.png';
      if (isBetaDesign) {
        $(control).text(ableText);
        $('#robot_img')
          .attr('title', ableText)
          .attr('src', 'https://raw.githubusercontent.com/recoders/chessbot/master/images/' + ableIcon);
      } else {
        $(control).addClass('success')
          .children('img').attr('src', 'https://raw.githubusercontent.com/recoders/chessbot/master/images/' + ableIcon);
      }
      cookie.set(eChessCookie, enableSuggestion ? '1' : '0');
    }

    function standartPagePreparations(engine) {
        $('#robot_notice')
            .on('click', function(e) {
                toggleSuggestionStandart(this);
                return false;
            });

        enableSuggestion = cookieManager.get(eChessCookie) == '0';
        toggleSuggestionStandart($('#robot_notice')[0]);
    }

    page.createStandartBot = function (botEngine, isBeta) {
      // eChess version
      isBetaDesign = isBeta == true;
      if (isBetaDesign) {
        attachButtonInNewDesign(true);
        $('#topPlayer div.user-tagline')
          .after('<div id="robot_text" style="font-size: 115%; font-weight: bolder;">Best move: calculating...</div>');
      } else {
        $('.title.bottom-4')
            .before('<div id="robot_notice" title="Click me to enable/disable bot suggestions." class="notice bottom-8" style="cursor: pointer; height: 20px;"><span id="robot_text"></span></div>');
        $('#robot_text')
            .before($('<img>', {
                'id': 'robot_icon',
                'style': 'float: left; cursor: pointer;',
                'alt': 'ChessBot icon',
                'src': 'https://raw.githubusercontent.com/recoders/chessbot/master/images/robot-20.png',
                'title': 'Click me to enable/disable bot suggestions.'
            }));
      }
      currentBot = CURRENT_BOT_STANDART;
      standartPagePreparations(botEngine);
    }

    // Suggestion squares
    var $greenSquare = $('<div>', {
        'id': 'greenSquare',
        'style': 'position: absolute; z-index: 1; opacity: 0.5; background-color: #7ef502;'
    }), $pinkSquare = $('<div>', {
        'id': 'pinkSquare',
        'style': 'position: absolute; z-index: 1; opacity: 0.5; background-color: #f55252;'
    });

    function madeMachineMove(move) {
        if (!move) return;
        var fromSquare = move.substring(0,2),
            toSquare = move.substring(2,4),
            // Find board container
            $boardContainer = isBetaDesign 
                    ? $('.tab-pane.active:not(.ng-hide) .game-board-container')
                    : $('.boardContainer').not('.visibilityHidden').not('.chess_com_hidden'),
            // Find board
            $board = currentBot == CURRENT_BOT_LICHESS ? $('.top .cg-board') : (
                isBetaDesign
                    ? $boardContainer.find('.chessboard')
                    : $boardContainer.find('.chess_viewer')
            ),
            // Calculate sizes
            boardHeight = $board.height(),
            boardWidth = $board.width(),
            betaSizeCorrection = isBetaDesign || currentBot == CURRENT_BOT_CHESSKID_SIMPLE ? 1 : 2,
            pieceHeight = (boardHeight - betaSizeCorrection) / 8,
            pieceWidth = (boardWidth - betaSizeCorrection) / 8,
            // Is flipped?
            is_flipped = currentBot == CURRENT_BOT_LICHESS ? $board.hasClass('orientation-black') : (
                isBetaDesign ? $boardContainer.parent().find(".player-info.black.bottom").length > 0 : $board.hasClass('chess_boardFlipped')
            ),
            betaPositionFix = isBetaDesign ? (is_flipped ? -1 : 1 ) : 0,
            betaVerticalFix = isBetaDesign ? (is_flipped ? pieceHeight : -pieceHeight ) : 1,
            betaHorizontalFix = isBetaDesign ? 0 : 1,
            chessKidVerticalFix = currentBot == CURRENT_BOT_CHESSKID_SIMPLE ? -12 : 0,
            chessKidHorizontalFix = currentBot == CURRENT_BOT_CHESSKID_SIMPLE ? -16 : 0,
            $boardArea = currentBot === CURRENT_BOT_LICHESS ? $board : $board.find("div[id^=chessboard_][id$=_boardarea]");

        // Move pinkSquares to the right place
        function placeSquareToPointChessCom($square, point) {
            $('#' + $square.attr('id')).remove(); // Fix for: https://github.com/recoders/chessbot/issues/20
            var pinkTop, pinkLeft;
            if (!is_flipped) {
                pinkTop = $boardArea[0].offsetTop + (boardHeight - pieceHeight * (parseInt(point[1], 10) + betaPositionFix)) - betaVerticalFix + chessKidVerticalFix; // 1 pixel from border
                pinkLeft = $boardArea[0].offsetLeft + pieceWidth * (point.charCodeAt(0) - 97) + betaHorizontalFix + chessKidHorizontalFix; // 'a'.charCodeAt(0) == 97
            } else {
                pinkTop = $boardArea[0].offsetTop + (pieceHeight * (parseInt(point[1], 10) - 1 + betaPositionFix)) + betaVerticalFix + chessKidVerticalFix; // 1 pixel from border
                pinkLeft = $boardArea[0].offsetLeft + (boardWidth - pieceWidth * (point.charCodeAt(0) - 96)) - betaHorizontalFix + chessKidHorizontalFix; // 'a'.charCodeAt(0) == 97
            }

            $square.css({
                    'width': pieceWidth + 'px',
                    'height': pieceHeight + 'px',
                    'top': pinkTop + 'px',
                    'left': pinkLeft + 'px'
                });
            $square.appendTo($board);
        }

        placeSquareToPointChessCom($greenSquare, fromSquare);
        placeSquareToPointChessCom($pinkSquare, toSquare);
    }
    
    page.showMove = function (data) {
      var humanMovesModificator = function (humanMoves) {
        if (humanMoves != '') {
            humanMoves = humanMoves.split(' ');
            for (hm in humanMoves) {
                if (hm == 0) { continue; }
                humanMoves[hm] = ((parseInt(hm, 10) + currentColor) % 2 == 0 ? '↑' : '↓') + humanMoves[hm];
            }
            move = (currentColor % 2 == 0 ? '↑' : '↓') + humanMoves.slice(0,5).join(' ');
        }
        return move;
      }
        var move = (data || {}).nextMove;
        var humanMoves = (data || {}).humanMoves;
        if (currentBot == CURRENT_BOT_STANDART) {
          if (isBetaDesign) {
            move = humanMovesModificator(humanMoves);
            $('#robot_text').text('=>: '  + (move != '' ? move : ' : nothing =('));
          } else {
            $('#robot_text').text('Best move: '  + move);
          }
        } else {
            // Live and simple version are same
            move = humanMovesModificator(humanMoves);
            $('#robot_message').text('Best move: '  + (move != '' ? move : ' : nothing =('));
            if (enableSuggestion) {
                madeMachineMove(data.machineMove);
            }
        }
    }
    
    return page;
};

var pageManager = new PageManager(jQuery, this, cookie);

var BotFactory = function($, window, bot, pageManager) {
  var factory = {};
  
  factory.const = [
    {
      name: 'chess_com_simple',
      host: 'chess.com',
      path: '/simple'
    },
    { 
      name: 'chess_com_live',
      host: 'chess.com',
      path: '/live'
    },
    {
      name: 'chess_com_standart',
      host: 'chess.com',
      nopath: ''
    },
    {
      name: 'lichess_live',
      host: 'lichess.org',
      nopath: ''
    },
    {
      name: 'chesskid_live',
      host: 'chesskid.com',
      path: '/simple'
    }
  ];

  
  factory.selectBot = function() {
    var botType = undefined;
    factory.const.forEach(function(item, i, arr) {
      if (window.location.hostname.indexOf(item.host) > -1) {
        if (botType) { return; }
        if (item.path !== undefined && window.location.pathname === item.path) {
          botType = item.name;
        } else 
        if (item.nopath !== undefined && window.location.pathname !== item.nopath) {
          botType = item.name;
        }
      }
    });
    return botType;
  }
  
  factory.createBot = function(botType) {
    console.log(botType);
    switch (botType) {
      case 'chess_com_simple':
        pageManager.createSimpleBot(bot);
        bot.moveFound = pageManager.showMove;
        break;
      case 'chess_com_live':
        setTimeout(function(){
            pageManager.createLiveBot(bot, $('#top_bar_settings').length == 0);
        }, 5000);
        bot.moveFound = pageManager.showMove;
        break;
      case 'chess_com_standart':
        var betaDesign = $('#EmailChessGame').length == 0;

        pageManager.createStandartBot(bot, betaDesign);
        bot.moveFound = pageManager.showMove;

        if(betaDesign){
          setTimeout(function(){
            bot.makeLiveSuggest($('div.notationVertical a.gotomove'));
          }, 3000);
        } else {
          var fen = pageManager.getCurrentFen();
          bot.makeMove(fen);
        }
        break;
      case 'lichess_live':
        pageManager.createLiChessBot(bot);
        bot.moveFound = pageManager.showMove;
        break;
      case 'chesskid_live':
        pageManager.createChessKidBot(bot);
        bot.moveFound = pageManager.showMove;
        break;
    }
  }
  
  return factory;
}

// Startup code
$(document).ready(function() {
  var botFactory = new BotFactory(jQuery, this, bot, pageManager);
  botFactory.createBot(botFactory.selectBot());
});