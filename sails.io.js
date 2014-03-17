/**
 * sails.io.js
 *
 * This file allows you to send and receive socket.io messages to & from Sails
 * by simulating a REST client interface on top of socket.io.
 *
 * It models its API after the $.ajax pattern from jQuery you might be familiar with.
 *
 * So if you're switching from using AJAX to sockets, instead of:
 *    `$.post( url, [data], [cb] )`
 *
 * You would use:
 *    `socket.post( url, [data], [cb] )`
 *
 * For more information, visit:
 * http://sailsjs.org/#documentation
 */

(function () {

  // Constants
  var CONNECTION_METADATA_PARAMS = {
    version: '__sails_io_sdk_version',
    platform: '__sails_io_sdk_platform',
    language: '__sails_io_sdk_language'
  };

  // Current version of this SDK (sailsDK?!?!) and other metadata
  // that will be sent along w/ the initial connection request.
  var SDK_INFO = {
    version: '0.10.0',  // TODO: pull this automatically from package.json during build.
    platform: typeof module === 'undefined' ? 'browser' : 'node',
    language: 'javascript'
  };
  SDK_INFO.versionString =
  CONNECTION_METADATA_PARAMS.version + '=' + SDK_INFO.version + '&' +
  CONNECTION_METADATA_PARAMS.platform + '=' + SDK_INFO.platform + '&' +
  CONNECTION_METADATA_PARAMS.language + '=' + SDK_INFO.language;


  // In case you're wrapping the socket.io client to prevent pollution of the
  // global namespace, you can pass in your own `io` to replace the global one.
  // But we still grab access to the global one if it's available here:
  var _io = (typeof io !== 'undefined') ? io : null;

  /**
   * Augment the `io` object passed in with methods for talking and listening
   * to one or more Sails backend(s).  Automatically connects a socket and
   * exposes it on `io.socket`.  If a socket tries to make requests before it
   * is connected, the sails.io.js client will queue it up.
   * 
   * @param {SocketIO} io
   */
  
  function SailsIOClient (io) {

    // Prefer the passed-in `io` instance, but also use the global one if we've got it.
    io = io || _io;

    // If the socket.io client is not available, none of this will work.
    if (!io) throw new Error('`sails.io.js` requires a socket.io client, but `io` was not passed in.');




    //////////////////////////////////////////////////////////////
    /////                              ///////////////////////////
    ///// PRIVATE METHODS/CONSTRUCTORS ///////////////////////////
    /////                              ///////////////////////////
    //////////////////////////////////////////////////////////////

    /**
     * TmpSocket
     * 
     * A mock Socket used for binding events before the real thing
     * has been instantiated (since we need to use io.connect() to
     * instantiate the real thing, which would kick off the connection
     * process w/ the server, and we don't necessarily have the valid
     * configuration to know WHICH SERVER to talk to yet.)
     *
     * @api private
     * @constructor
     */
    
    function TmpSocket () {
      var boundEvents = {};
      this.on = function (evName, fn) {
        boundEvents[evName] = fn;
        return this;
      };
      this.become = function ( actualSocket ) {
        for (var evName in boundEvents) {
          actualSocket.on(evName, boundEvents[evName]);
        }
        return actualSocket;
      };
    }

    
    /**
     * isConnected
     * 
     * @api private
     * @param  {Socket}  socket
     * @return {Boolean} whether the socket is connected and able to
     *                           communicate w/ the server.
     */
    
    function _isConnected (socket) {
      return socket.socket && socket.socket.connected;
    }



    /**
     * The response received from a Sails server.
     *
     * @api private
     * @param  {Object}  responseCtx
     *         => :body
     *         => :statusCode
     *         => :headers
     * @constructor
     */
    
    function SailsResponse ( responseCtx ) {
      this.body = responseCtx.body || {};
      this.headers = responseCtx.headers || {};
      this.statusCode = responseCtx.statusCode || 200;
    }
    SailsResponse.prototype.toString = function () {
      return '[ResponseFromSails]' + '  -- '+
             'Status: '+ this.statusCode + '  -- '+
             'Headers: '+ this.headers + '  -- '+
             'Body: '+ this.body;
    };
    SailsResponse.prototype.toPOJO = function () {
      return {
        body: this.body,
        headers: this.headers,
        statusCode: this.statusCode
      };
    };
    SailsResponse.prototype.pipe = function () {
      // TODO: look at substack's stuff
      return new Error('Not implemented yet.');
    };


    /**
     * @api private
     * @param  {Socket} socket  [description]
     * @param  {Object} requestCtx [description]
     */
    
    function _emitFrom ( socket, requestCtx ) {

      // Since callback is embedded in requestCtx,
      // retrieve it and delete the key before continuing.
      var cb = requestCtx.cb;
      delete requestCtx.cb;

      // Name of socket request listener on the server
      // ( === the request method, e.g. 'get', 'post', 'put', etc. )
      var sailsEndpoint = requestCtx.method;
      socket.emit(sailsEndpoint, requestCtx, function serverResponded ( responseCtx ) {
        var serverResponse = new SailsResponse(responseCtx);
        cb && cb(serverResponse);
      });
    }

    //////////////////////////////////////////////////////////////
    ///// </PRIVATE METHODS/CONSTRUCTORS> ////////////////////////
    //////////////////////////////////////////////////////////////











    // We'll be adding methods to `io.SocketNamespace.prototype`, the prototype for the 
    // Socket instance returned when the browser connects with `io.connect()`
    var Socket = io.SocketNamespace;



    /**
     * Simulate a GET request to sails
     * e.g.
     *    `socket.get('/user/3', Stats.populate)`
     *
     * @api public
     * @param {String} url    ::    destination URL
     * @param {Object} params ::    parameters to send with the request [optional]
     * @param {Function} cb   ::    callback function to call when finished [optional]
     */

    Socket.prototype.get = function(url, data, cb) {

      // `data` is optional
      if (typeof data === 'function') {
        cb = data;
        data = {};
      }
      
      return this._request({
        method: 'get',
        data: data,
        url: url
      }, cb);
    };



    /**
     * Simulate a POST request to sails
     * e.g.
     *    `socket.post('/event', newMeeting, $spinner.hide)`
     *
     * @api public
     * @param {String} url    ::    destination URL
     * @param {Object} params ::    parameters to send with the request [optional]
     * @param {Function} cb   ::    callback function to call when finished [optional]
     */

    Socket.prototype.post = function(url, data, cb) {

      // `data` is optional
      if (typeof data === 'function') {
        cb = data;
        data = {};
      }
      
      return this._request({
        method: 'post',
        data: data,
        url: url
      }, cb);
    };



    /**
     * Simulate a PUT request to sails
     * e.g.
     *    `socket.post('/event/3', changedFields, $spinner.hide)`
     *
     * @api public
     * @param {String} url    ::    destination URL
     * @param {Object} params ::    parameters to send with the request [optional]
     * @param {Function} cb   ::    callback function to call when finished [optional]
     */

    Socket.prototype.put = function(url, data, cb) {

      // `data` is optional
      if (typeof data === 'function') {
        cb = data;
        data = {};
      }

      return this._request({
        method: 'put',
        data: data,
        url: url
      }, cb);
    };



    /**
     * Simulate a DELETE request to sails
     * e.g.
     *    `socket.delete('/event', $spinner.hide)`
     *
     * @api public
     * @param {String} url    ::    destination URL
     * @param {Object} params ::    parameters to send with the request [optional]
     * @param {Function} cb   ::    callback function to call when finished [optional]
     */

    Socket.prototype['delete'] = function(url, data, cb) {
      
      // `data` is optional
      if (typeof data === 'function') {
        cb = data;
        data = {};
      }

      return this._request({
        method: 'delete',
        data: data,
        url: url
      }, cb);
    };



    /**
     * Socket.prototype._request
     * 
     * Simulate HTTP over Socket.io.
     *
     * @api private
     * @param  {[type]}   options [description]
     * @param  {Function} cb      [description]
     */
    Socket.prototype._request = function (options, cb) {

      // Sanitize options (also data & headers)
      var usage = 'Usage:\n socket.' +
        (options.method || 'request') +
        '( destinationURL, [dataToSend], [fnToCallWhenComplete] )';

      options = options || {};
      options.data = options.data || {};
      options.headers = options.headers || {};

      // Remove trailing slashes and spaces to make packets smaller.
      options.url = options.url.replace(/^(.+)\/*\s*$/, '$1');
      if (typeof options.url !== 'string') {
        throw new Error('Invalid or missing URL!\n' + usage);
      }
      
      var self = this;

      // Build a simulated request object.
      var request = {
        method: options.method,
        data: options.data,
        url: options.url,
        headers: options.headers,
        // Callback arguments are (body, response)
        cb: function(data) {
          if (data.body) {
            cb(data.body, data);
          } else {
            cb(data);
          }
        }
      };

      // If this socket is not connected yet, queue up this request
      // instead of sending it.
      // (so it can be replayed when the socket comes online.)
      if ( !_isConnected(self) ) {

        // If no queue array exists for this socket yet, create it.
        requestQueues[self.id] = requestQueues[self.id] || [];
        requestQueues[self.id].push(request);
        return;
      }

      
      // Otherwise, our socket is ok!
      // Send the request.
      _emitFrom(self, request);
    };



    // `requestQueues` and `sockets`
    // 
    // Used to simplify app-level connection logic-- i.e. so you don't
    // have to wait for the socket to be connected to start trying to 
    // synchronize data.
    // 
    // It supports use across multiple sockets, and ends up looking
    // something like:
    // {
    //   '9ha021381359': [{...queuedReq26...}, {...queuedReq27...}, ...],
    //   '2abcd8d8d211': [{...queuedReq18...}, {...queuedReq19...}, ...],
    //   '992294111131': [{...queuedReq11...}, {...queuedReq12...}, ...]
    // }
    var requestQueues = {};
    var sockets = {};


    // Set a `sails` object that may be used for configuration before the
    // first socket connects (i.e. to prevent auto-connect)
    io.sails = {
      autoConnect: true,

      // TODO:
      // listen for a special private message from server with environment
      // and other config.
      environment: 'production'
    };



    /**
     * Override `io.connect` to coerce it into using the io.sails
     * connection URL config, as well as sending identifying information
     * (most importantly, the current version of this SDK)
     * 
     * @param  {String} url  [optional]
     * @param  {Object} opts [optional]
     * @return {Socket}
     */
    io.sails._origConnectFn = io.connect;
    io.connect = function (url, opts) {
      opts = opts || {};

      // If explicit connection url is specified, use it
      url = url || io.sails.url || undefined;

      // Mix the current SDK version into the query string in
      // the connection request to the server:
      if (typeof opts.query !== 'string') opts.query = SDK_INFO.versionString;
      else opts.query += '&' + SDK_INFO.versionString;

      return io.sails._origConnectFn(url, opts);
    };



    // io.socket
    // 
    // The eager instance of Socket which will automatically try to connect
    // using the host that this js file was served from.
    // 
    // This can be disabled or configured by setting `io.socket.options` within the
    // first cycle of the event loop.
    // 

    // In the mean time, this eager socket will be defined as a TmpSocket
    // so that events bound by the user before the first cycle of the event
    // loop (using `.on()`) can be rebound on the true socket.
    io.socket = new TmpSocket();
    
    setTimeout(function () {

      // If autoConnect is disabled, delete the TmpSocket and bail out.
      if (!io.sails.autoConnect) {
        delete io.socket;
        return io;
      }

      // Start connecting after the current cycle of the event loop
      // has completed.
      // console.log('Auto-connecting a socket to Sails...');
      
      // Initiate connection
      var actualSocket = io.connect(io.sails.url);

      // Replay event bindings from the existing TmpSocket
      io.socket = io.socket.become(actualSocket);
      
      // Attach a listener which fires when a connection is established:
      io.socket.on('connect', function socketConnected() {

        if ( io.sails.environment !== 'production' ) {
          console && typeof console.log === 'function' && console.log(
            'Socket is now connected and globally accessible as `socket`.\n' +
            'e.g. to send a GET request to Sails via Socket.io, try: \n' +
            '`socket.get("/foo", function (response) { console.log(response); })`'
          );
        }

        // Save reference to socket when it connects
        sockets[io.socket.id] = io.socket;

        // Run the request queue for each socket.
        for (var socketId in requestQueues) {
          var pendingRequestsForSocket = requestQueues[socketId];
          
          for (var i in pendingRequestsForSocket) {
            var pendingRequest = pendingRequestsForSocket[i];
            
            // Emit the request.
            _emitFrom(sockets[socketId], pendingRequest);
          }
        }
      });
      
      // TODO:
      // manage disconnects in a more helpful way
      io.socket.on('disconnect', function () {
        // console.log('*** DISCONNECT YEAAAH');
      });

      // Listen for failed connects:
      // (usually because of a missing or invalid cookie)
      io.socket.on('error', failedToConnect);

      function failedToConnect (err) {
        console && typeof console.log === 'function' && console.log(
          'Failed to connect socket (probably due to failed authorization on server)',
          'Error:', err
        );
      }
      
    }, 0);


    // Return the `io` object.
    return io;


    // TODO:
    // handle failed connections due to failed authorization
    // in a smarter way (probably can listen for a different event)

    // TODO:
    // After a configurable period of time, if the socket has still not connected,
    // throw an error, since the `socket` might be improperly configured.

    // throw new Error(
    //  '\n' +
    //  'Backbone is trying to communicate with the Sails server using '+ socketSrc +',\n'+
    //  'but its `connected` property is still set to false.\n' +
    //  'But maybe Socket.io just hasn\'t finished connecting yet?\n' +
    //  '\n' +
    //  'You might check to be sure you\'re waiting for `socket.on(\'connect\')`\n' +
    //  'before using sync methods on your Backbone models and collections.'
    // );

  }


  // Add CommonJS support to allow this client SDK to be used from Node.js.
  if (typeof module === 'object' && typeof module.exports !== 'undefined') {
    return module.exports = SailsIOClient;
  }

  // Otherwise, try to instantiate the client:
  // In case you're wrapping the socket.io client to prevent pollution of the
  // global namespace, you can replace the global `io` with your own `io` here:
  return SailsIOClient();

})();