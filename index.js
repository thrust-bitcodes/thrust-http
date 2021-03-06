var File = Java.type("java.io.File")
var URLClassLoader = Java.type("java.net.URLClassLoader")
var Class = Java.type("java.lang.Class")
var ClassLoader = Java.type("java.lang.ClassLoader")
var Integer = Java.type("java.lang.Integer")
var Scanner = Java.type("java.util.Scanner")
var StandardCharsets = Java.type("java.nio.charset.StandardCharsets")
var System = Java.type("java.lang.System")
var URL = Java.type("java.net.URL")
var URLConnection = Java.type("java.net.URLConnection")
var URLDecoder = Java.type("java.net.URLDecoder")

var Tomcat = Java.type("org.apache.catalina.startup.Tomcat")
var WebResourceRoot = Java.type("org.apache.catalina.WebResourceRoot")
var StandardContext = Java.type("org.apache.catalina.core.StandardContext")
var DirResourceSet = Java.type("org.apache.catalina.webresources.DirResourceSet")
var StandardRoot = Java.type("org.apache.catalina.webresources.StandardRoot")

var Writer = Java.type("java.io.Writer")
var HttpServlet = Java.type("javax.servlet.http.HttpServlet")
var HttpServletRequest = Java.type("javax.servlet.http.HttpServletRequest")
var HttpServletResponse = Java.type("javax.servlet.http.HttpServletResponse")
var Context = Java.type("org.apache.catalina.Context")
var LifecycleException = Java.type("org.apache.catalina.LifecycleException")

/**
 * Gerenciador de rotas. Processa as requisições HTTP e segundo definições
 * do bitcode (módulo) utilizado para o gerenciamento, endereça o código a
 * ser executado. Similar ao framework "Express" no ecosistema NodeJS.
 */
var router

/**
  * Função que inicia um servidor na porta informada e com o roteamento informados.
    Caso o router não seja passado, o server criará um default internamente.
  * @param {Number} port - porta em que o servidor será levantado
  * @param {thrust-bitcodes/router} [httpRouter=undefined] -router customizado com rotas de serviço
  * @param {Object} options - Objeto que pode ser passado sobreescrevendo configurações padrão do http
  */
function createServer(port, httpRouter, options) {
  var config = getBitcodeConfig('http');

  var compression = config('compression');

  var opts = Object.assign({
    staticFilesPath: config('staticFilesPath') || '/static',
    compression: typeof compression != undefined ? config('compression') : true,
    compressionMinSize: config('compressionMinSize') || 1024,
    compressableMimeType: config('compressableMimeType') || "text/html,text/xml,text/css,application/json,application/javascript",
    apiPath: config('apiPath') || '/*',
    servlets: {}
  }, options);

  var tomcat = new Tomcat()

  var ctx = tomcat.addContext("", new File(rootPath).getAbsolutePath())
  ctx.setAllowCasualMultipartParsing(true)

  router = (httpRouter) ? httpRouter : require("thrust-bitcodes/router")

  Tomcat.addServlet(ctx, "thrust", new HttpServlet() {
    service: function (request, response) {
      service(request, response)
    }
  })
  ctx.addServletMappingDecoded(opts.apiPath, "thrust")

  Object.keys(opts.servlets).forEach(function (servletName) {
    let servletInfo = opts.servlets[servletName];

    Tomcat.addServlet(ctx, servletName, new HttpServlet() {
      service: servletInfo.service 
    });

    servletInfo.paths.forEach(function (path) {
      ctx.addServletMappingDecoded(path, servletName)
    });
  });

  var staticFilesPath = '/' + opts.staticFilesPath.replace(/^\/|\/\*$|\//g, '') + '/*'
  Tomcat.addServlet(ctx, "static", org.apache.catalina.servlets.DefaultServlet.class.getCanonicalName());
  ctx.addServletMappingDecoded(staticFilesPath, "static");

  Tomcat.addServlet(ctx, "favicon", org.apache.catalina.servlets.DefaultServlet.class.getCanonicalName());
  ctx.addServletMappingDecoded("/favicon.ico", "favicon");

  tomcat.setPort(port)

  var connector = tomcat.getConnector();

  if (opts.maxPostSize) {
    connector.setMaxPostSize(opts.maxPostSize);
  }

  connector.setProperty("compression", opts.compression ? "on" : "off");
  connector.setProperty("compressionMinSize", String(opts.compressionMinSize));
  connector.setProperty("compressableMimeType", opts.compressableMimeType);

  tomcat.start()
  print("Running on port " + port + "...")
  tomcat.getServer().await()
}

function service(httpRequest, httpResponse) {
  var request = mountRequest(httpRequest)
  var response = mountResponse(httpResponse)
  var params = parseParams(request.queryString, request.contentType)

  router.process(params, request, response)
}

function parseParams(strParams, contentType) {
  var params = {}

  function parseValue(value) {
    if (value === 'true') {
      return true
    }

    if (value === 'false') {
      return false
    }

    return isNaN(value) ? value : Number(value)
  }

  function parseKey(skey, value) {
    var patt = /\w+|\[\w*\]/g
    var k, ko, key = patt.exec(skey)[0]
    var p = params
    while ((ko = patt.exec(skey)) != null) {
      k = ko.toString().replace(/\[|\]/g, '')
      var m = k.match(/\d+/gi)
      if ((m != null && m.toString().length == k.length) || ko == '[]') {
        k = parseInt(k)
        p[key] = p[key] || []
      } else {
        p[key] = p[key] || {}
      }
      p = p[key]
      key = k
    }
    if (typeof (key) == 'number' && isNaN(key))
      p.push(parseValue(value))
    else
      p[key] = parseValue(value)
  }

  function parseParam(sparam) {
    var vpar = unescape(sparam).split('=')
    parseKey(vpar[0], vpar[1])
  }

  if (strParams !== null && strParams !== '') {

    if (contentType && contentType.startsWith('application/json')) {
      params = JSON.parse(strParams)
    } else {
      var arrParams = strParams.split('&')

      for (var i = 0; i < arrParams.length; i++) {
        parseParam(arrParams[i])
      }
    }
  }

  return params
}


function mountRequest(httpRequest) {
  var queryString = (function () {
    var contentType = httpRequest.getContentType() || ''
    var body = ''
    var qs = ''

    var binaryTypes = ['multipart/form-data', 'application/zip', 'application/octet-stream']
    var isBinary = binaryTypes.some(function(type) {
      return contentType.indexOf(type) > -1
    })

    if (!isBinary) {
      body = httpRequest.getReader().readLine()

      if (body && body !== '') {

        return contentType.startsWith('application/json') ? body : URLDecoder.decode(body, 'UTF-8')
      }

      qs = httpRequest.getQueryString()
      qs = (qs === null) ? '' : URLDecoder.decode(qs, 'UTF-8')
    }

    return qs
  })()

  var headers = (function () {
    var headerNames = httpRequest.getHeaderNames()
    var headersNameValue = {}

    if (headerNames != null) {
      while (headerNames.hasMoreElements()) {
        var name = headerNames.nextElement()
        headersNameValue[name] = httpRequest.getHeader(name)
      }
    }

    return headersNameValue
  })()

  /**
   * @function {getParts} - Retorna uma coleção de '*javax.servlet.http.Parts*', que por definição
   *  *"represents a part as uploaded to the server as part of a multipart/form-data
   * request body. The part may represent either an uploaded file or form data."*
   * @return {type} {description}
   */
  var parts = (function () {
    var contentType = httpRequest.getContentType() || ""

    if (contentType.indexOf("multipart/form-data") == -1)
      return []

    return httpRequest.getParts().toArray()
  })

  return {
    httpRequest: httpRequest,

    queryString: queryString,

    rest: httpRequest.getRequestURI().replace(httpRequest.getContextPath(), ""),

    contentType: httpRequest.getContentType() || "",

    method: httpRequest.getMethod().toUpperCase(),

    requestURI: httpRequest.getRequestURI(),

    pathInfo: httpRequest.getPathInfo(),

    scheme: httpRequest.getScheme(),

    host: httpRequest.getServerName(),

    port: httpRequest.getServerPort(),

    cookies: httpRequest.getCookies(),

    headers: headers,

    contextPath: httpRequest.getContextPath(),

    servletPath: httpRequest.getServletPath(),

    parts: parts
  }

}


function mountResponse(httpResponse) {
  var response = {
    httpResponse: httpResponse,

    status: 200,

    contentLength: 0,

    contentType: "text/html",

    charset: "UTF-8",

    headers: {},

    out: [],

    clean: function () {
      this.out = []
      this.headers = {}
      this.contentLength = 0
      this.contentType = "text/html"
      this.charset = "utf-8"
    },

    /**
     * Escreve em formato *texto* o conteúdo passado no parâmetro *content* como resposta
     * a requisição. Modifica o valor do *content-type* para *'text/html'*.
     * @param {Object} data - dado a ser enviado para o cliente.
     * @param {Number} statusCode - (opcional) status de retorno do request htttp.
     * @param {Object} headers - (opcional) configurações a serem definidas no header http.
     */
    write: function (content) {
      this.out.push(content)

      return this
    },

    setOut: function (content) {
      this.out = [content]

      return this
    },

    toBytes: function () {
      return new java.lang.String(this.out).getBytes()
    },

    toJson: function () {
      return (typeof (this.out[0]) == "object") ? JSON.stringify(this.out[0]) : this.out.join("")
    },

    toString: function () {
      return this.out.join("")
    },

    addHeader: function (name, value) {
      this.headers[name] = value
    },

    /**
     * Escreve em formato *JSON* o objeto passado no parâmetro *data* como resposta
     * a requisição. Modifica o valor do *content-type* para *'application/json'*.
     * @param {Object} data - dado a ser enviado para o cliente.
     * @param {Number} statusCode - (opcional) status de retorno do request htttp.
     * @param {Object} headers - (opcional) configurações a serem definidas no header http.
     */
    json: function (data, statusCode, headers) {
      var ths = this

      this.contentType = "application/json"
      this.status = statusCode || 200

      for (var opt in (headers || {})) {
        ths.headers[opt] = headers[opt]
      }

      this.out[0] = (typeof (data) == "object") ? JSON.stringify(data) : data
    },

    /**
     * Objeto que encapsula os métodos de retornos quando ocorre um erro na requisição http.
     * @ignore
     */
    error: {
      /**
       * Escreve em formato *JSON* uma mensagem de erro como resposta a requisição no
       * formato {message: *message*, status: *statusCode*}. Modifica o valor
       * do *content-type* para *'application/json'*.
       * @alias error.json
       * @memberof! http.Response#
       * @instance error.json
       * @param {String} message - mensagem de erro a ser enviada no retorno da chamada do browser.
       * @param {Number} statusCode - (opcional) status de retorno do request htttp.
       * @param {Object} headers - (opcional) configurações a serem definidas no header http.
       */
      json: function (message, statusCode, headers) {
        var ths = response

        ths.contentType = "application/json"
        ths.status = statusCode || 200

        for (var opt in (headers || {})) {
          ths.headers[opt] = headers[opt]
        }

        ths.out[0] = JSON.stringify({
          status: ths.status,
          message: message
        })
      }
    }
  }

  return response
}

exports = {
  createServer: createServer
}
