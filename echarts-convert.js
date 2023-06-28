/**
 * Created by SaintLee on 2017/6/22.
 */

(function (window, document, undefined) {
  "use strict";

  // 引入module
  var system = require("system"), // 获取参数
    path = phantom.libraryPath,
    command = require(path + "/module/command.js"); // 参数module

  /**
   * phantomJs 全局异常监听
   * @param msg
   * @param trace
   */
  phantom.onError = function (msg, trace) {
    var msgStack = ["Convert ERROR: " + msg];
    if (trace && trace.length) {
      msgStack.push("TRACE:");
      trace.forEach(function (t) {
        msgStack.push(
          " -> " +
            (t.file || t.sourceURL) +
            ": " +
            t.line +
            (t.function ? " (in function " + t.function + ")" : "")
        );
      });
    }
    console.error(msgStack.join("\n"));
    phantom.exit(1);
  };

  /**
   * 参数
   * @type {Command}
   */
  var commandParams = command
    .version("0.0.1")
    .option("-s, --server", "provide echarts convert http server")
    .option(
      "-p, --port <number>",
      "change server port when add -s or --server",
      9090
    )
    .option(
      "-o, --opt <json>",
      "add the param of echarts method [ eChart.setOption(opt) ]"
    )
    .option(
      "-t, --type <value>",
      "provide file/base64 for image, default file",
      /^(file|base64)$/i,
      "base64"
    )
    .option("-f, --outfile <path>", "add output of the image file path")
    .option("-w, --width <number>", "change image width", "800")
    .option("-h, --height <number>", "change image height", "400")
    .option("-d, --data <json>", "data", "")
    .parse(system.args);

  // ***********************************
  // Echarts转换器
  // ***********************************
  function Convert(params) {
    this.params = params || commandParams; // 参数命令
    var tparams = params || commandParams; 
    console.log(tparams.width)
    // for (var key in  this.params) {
    //   if (this.params.hasOwnProperty(key)) {
    //     console.log(key + ': ' + this.params[key]);
    //   }
    // }
    this.external = {
      JQUERY3: path + "/script/jquery-3.2.1.min.js",
      ECHARTS3: path + "/script/echarts.min.js",
      ECHARTS_CHINA: path + "/script/china.js",
    }; // 外部js
  }

  /**
   * 初始化
   */
  Convert.prototype.init = function () {
    var params = this.params;
    this.check(params);
    if (params.server) {
      this.server(params);
    } else {
      this.client(params);
    }
  };

  /**
   * 参数检查
   * @param params
   */
  Convert.prototype.check = function (params) {
    if (undefined === params.server && undefined === params.opt) {
      this.error("option argument missing -o, --opt <json>");
    }

    if (undefined !== params.opt) {
      var isJson = this.checkJson(params.opt);
      if (!isJson) {
        this.error("--opt <json> args not json string");
      }
    }

    if ("file" === params.type && undefined === params.outfile) {
      this.createTmpDir();
    }
  };

  /**
   * 检查是否是json字符串
   * @param value
   * @returns {boolean}
   */
  Convert.prototype.checkJson = function (value) {
    var re = /^\{[\s\S]*\}$|^\[[\s\S]*\]$/;
    // 类型为string
    if (typeof value !== "string") {
      return false;
    }
    // 正则验证
    if (!re.test(value)) {
      return false;
    }
    // 是否能解析
    try {
      value = '"' + value + '"';
      JSON.parse(value);
    } catch (err) {
      return false;
    }
    return true;
  };

  /**
   * 创建临时目录，并指定输出路径
   */
  Convert.prototype.createTmpDir = function () {
    var fs = require("fs"); // 文件操作
    var tmpDir = fs.workingDirectory + "/tmp";
    // 临时目录是否存在且可写
    if (!fs.exists(tmpDir)) {
      if (!fs.makeDirectory(tmpDir)) {
        this.error("Cannot make " + tmpDir + " directory\n");
      }
    }
    this.params.outfile = tmpDir + "/" + new Date().getTime() + ".png";
  };

  /**
   * 服务
   * @param params
   */
  Convert.prototype.server = function (params) {
    console.log(params);
    var server = require("webserver").create(), // 服务端
      convert = this;

    var listen = server.listen(params.port, function (request, response) {
      /**
       * 输出
       * @param data
       * @param success
       */
      function write(data, success, msg) {
        response.statusCode = 200;
        response.headers = {
          Cache: "no-cache",
          "Content-Type": "application/json;charset=utf-8",
        };
        response.write(convert.serverResult(data, success, msg));
        response.close();
      }

      //获取参数
      var args = convert.serverGetArgs(request);

      if (args.opt !== undefined) {
        var check = convert.serverCheckAndSet(params, args);

        if (check) {
          convert.client(params, write);
        } else {
          write(
            "",
            false,
            "failed to get image, please check parameter [opt] is a JSON"
          );
        }
      } else {
        write("", false, "failed to get image, missing parameter [opt]");
      }
    });

    // 判断服务是否启动成功
    if (!listen) {
      this.error(
        "could not create echarts-convert server listening on port " +
          params.port
      );
    } else {
      console.log("echarts-convert server start success. [pid]=" + system.pid);
    }
  };

  /**
   * 服务参数检查和赋值
   * @param params
   * @param args
   * @returns {boolean}
   */
  Convert.prototype.serverCheckAndSet = function (params, args) {
    if (this.checkJson(args.opt)) {
      params.opt = args.opt;
    } else {
      return false;
    }
    // if (this.checkJson(args.data)) {
    params.data = args.data;
    // } else {
    //   return false;
    // }

    if (/^(file|base64)$/i.exec(args.type)) {
      params.type = args.type;
    }

    if (!isNaN(args.width)) {
      params.width = args.width;
    }

    if (!isNaN(args.height)) {
      params.height = args.height;
    }
    return true;
  };

  /**
   * 结果返回
   * @param data
   * @param success
   * @param msg
   */
  Convert.prototype.serverResult = function (data, success, msg) {
    var result = {
      code: success ? 1 : 0,
      msg: undefined === msg ? (success ? "success" : "failure") : msg,
      data: data,
    };

    return JSON.stringify(result);
  };

  /**
   * 获取参数
   * @param request
   * @returns {{}}
   */
  Convert.prototype.serverGetArgs = function (request) {
    var args = {};
    if ("GET" === request.method) {
      var index = request.url.indexOf("?");
      if (index !== -1) {
        var getQuery = request.url.substr(index + 1);
        args = this.serverParseArgs(getQuery);
      }
    } else if ("POST" === request.method) {
      var postQuery = request.post;
      args = this.serverParseArgs(postQuery);
    }
    return args;
  };

  /**
   * 解析参数
   * @param query 字符串
   * @returns {{}} 对象
   */
  Convert.prototype.serverParseArgs = function (query) {
    var args = {},
      pairs = query.split("&");
    for (var i = 0; i < pairs.length; i++) {
      var pos = pairs[i].indexOf("=");
      if (pos === -1) continue;
      var key = pairs[i].substring(0, pos);
      var value = pairs[i].substring(pos + 1);
      // 中文解码，必须写两层
      value = decodeURIComponent(decodeURIComponent(value));
      args[key] = value;
    }
    return args;
  };

  /**
   * 访问渲染
   * @param params
   * @param fn
   */
  Convert.prototype.client = function (params, fn) {
    var page = require("webpage").create(); // 客户端
    var convert = this,
      external = this.external,
      render,
      output;

    /**
     *  渲染
     * @returns {*}
     */
    render = function () {
      switch (params.type) {
        case "file":
          // 渲染图片
          page.render(params.outfile);
          return params.outfile;
        case "base64":
        default:
          var base64 = page.renderBase64("PNG");
          return base64;
      }
    };

    /**
     * 输出
     * @param content 内容
     * @param success 是否成功
     */
    output = function (content, success, msg) {
      if (params.server) {
        fn(content, success, msg);
        page.close();
      } else {
        console.log(success ? "[SUCCESS]:" : "[ERROR]:" + content);
        page.close();
        convert.exit(params); // exit
      }
    };

    /**
     * 页面console监听
     * @param msg
     * @param lineNum
     * @param sourceId
     */
    page.onConsoleMessage = function (msg, lineNum, sourceId) {
      console.log(msg);
    };

    /**
     * 页面错误监听
     * @param msg
     * @param trace
     */
    page.onError = function (msg, trace) {
      output("", false, msg); // 失败,返回错误信息
    };

    // 空白页
    page.open("about:blank", function (status) {
      console.log(Object.keys(JSON.parse(params.data)))
      // 注入依赖js包
      var hasJquery = page.injectJs(external.JQUERY3);
      if(Object.keys(JSON.parse(params.data)) == 'ZSCQZBLYBDT' || Object.keys(JSON.parse(params.data)) == 'ZSCQZBLYBDTCT'){
        external.ECHARTS3 = path + "/script/echarts.min2.js"
      }else{
        external.ECHARTS3 = path + "/script/echarts.min.js"
      }
      var hasEchart = page.injectJs(external.ECHARTS3);
      var hasEchartChina = page.injectJs(external.ECHARTS_CHINA);

      // 检查js是否引用成功
      if (!hasJquery && !hasEchart) {
        output(
          "Could not found " + external.JQUERY3 + " or " + external.ECHARTS3,
          false
        );
      }

      // 创建echarts
      page.evaluate(createEchartsDom, params);

      // 定义剪切范围，如果定义则截取全屏
      page.clipRect = {
        top: 0,
        left: 0,
        width: params.width,
        height: params.height,
      };

      // 渲染
      var result = render();
      // 成功输出，返回图片或其他信息
      output(result, true);
    });
  };

  /**
   * 创建eCharts Dom层
   * @param params 参数
   */
  function createEchartsDom(params) {
    // 动态加载js，获取options数据
    $("<meta>")
      .attr("charset", "UTF-8")
      // .html('var objA = '+'{a:1,b:2}')
      .appendTo(document.head);
    // var obj = JSON.parse(params.data);
    // if (Object.keys(obj)[0]== "map_china") {
    //obj.map_china.min

    //JSON.parse(params.data.data);  params.data.type==
    var flag = Object.keys(JSON.parse(params.data));
    var obj = {};
    var options = {};
    if (flag == "map_china") {
      //地图代码 1-------------------------------------------------------------------------
      obj = JSON.parse(params.data).map_china;
      options = {
        textStyle: { fontFamily: "SimSun", textEncoding: "UTF-8" },
        // title:{
        //   text:params.data?Object.keys(JSON.parse(params.data)):'--',
        //   textStyle:{
        //     overflow:'break',
        //     width:200,
        //     color:'red'
        //   }
        // },
        // title:"十多个积分红烧豆腐",
        visualMap: {
          show: "true",
          min: Number(obj.min),
          max: Number(obj.max),
          left: "30",
          bottom: "20",
          itemWidth: 15,
          itemHeight: 120,
          inRange: {
            color: ["#ecf2fd", "#dee9fe", "#76c1f9", "#007dee", "#353c9a"],
          },
        },
        series: [
          {
            type: "map",
            map: "china",
            label: {
              normal: {
                show: true,
                fontSize: "8px",
              },
            },
            animation: false,
            zoom: 1.2,
            data: JSON.parse(obj.data),
          },
        ],
      };
      //地图代码-------------------------------------------------------------------------
    } else if (flag == "CYFBHB") {
      //横条图代码 大数据产业各一级产业环节分布 2-------------------------------------------------------------------------
      obj = JSON.parse(params.data).CYFBHB;
      var attaData1 = obj.attaData1;
      var attaData2 = obj.attaData2;
      var zbdata = obj.zbdata;
      options = {
        // title:{
        //   text:params.data?params.data:'--',
        //   textStyle:{
        //     overflow:'break',
        //     width:200,
        //     color:'red'
        //   }
        // },
        legend: {
          icon: "circle",
          itemGap: 15,
          itemWidth: 10, // 设置宽度
          itemHeight: 10,
          top: "5%",
          right: "45%",
          textStyle: {
            color: "#373c97",
          },
          data: [attaData1.name, attaData2.name],
        },
        title: {
          text: obj.title,
          left: "center",
          textStyle: { color: "#373c97" },
        },
        grid: {
          x: 125,
          y: 80,
          x2: 65,
          y2: 20,
        },
        xAxis: {
          show: true,
          type: "value",
          name: "单位:户",
          axisLine: {
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            textStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
        },
        yAxis: {
          data: zbdata,
          name: "一级环节名称",
          nameLocation: "end", // y轴name处于y轴的什么位置
          nameTextStyle: {
            fontSize: 14,
            fontWeight: 700,
            color: "#333333",
            align: "right",
          },
          axisLine: {
            show: false,
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            textStyle: {
              color: "#595959",
            },
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
        },
        series: [
          {
            name: attaData1.name,
            type: "bar",
            barWidth: 12,
            zlevel: 2,
            itemStyle: {
              color: "#383b96",
            },
            label: {
              show: true,
              position: "right",
              formatter: function (params) {
                return attaData1.label[params.dataIndex] + "%";
              },
            },
            data: attaData1.value,
          },
          {
            name: attaData2.name,
            type: "bar",
            barWidth: 12,
            zlevel: 2,
            itemStyle: {
              color: "#ffc63a",
            },
            label: {
              show: true,
              position: "right",
              formatter: function (params) {
                return attaData2.label[params.dataIndex] + "%";
              },
            },
            data: attaData2.value,
          },
        ],
      };
      //横条图代码 大数据产业各一级产业环节分布-------------------------------------------------------------------------
    } else if (flag == "JBXXQYNL") {
      //堆叠图柱子代码 大数据产业企业年龄数量分布 3-------------------------------------------------------------------------
      var JBXXQYNL = JSON.parse(params.data).JBXXQYNL;
      options = {
        color: ["#fac858", "#383b96", "#4EBB96", "#D5B829", "#DB611A"],
        title: [
          {
            text: JBXXQYNL.title,
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        legend: {
          icon: "circle",
          itemGap: 15,
          itemWidth: 10, // 设置宽度
          itemHeight: 10,
          top: "40",
          right: "30",
          textStyle: {
            color: "#333333",
          },
          data: [],
        },
        grid: {
          left: "4%",
          right: "4%",
          bottom: "3%",
          top: "12%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          axisLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
          axisTick: {
            show: false,
          },
          axisLabel: {
            show: true, //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            margin: 15,
            textStyle: {
              color: "#333333",
              fontStyle: "normal",
              fontSize: 12,
            },
          },
          data: ["1年内", "1-3年", "3-5年", "5-10年", "10年以上"],
        },
        yAxis: {
          type: "value",
          axisLabel: {
            //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            textStyle: {
              color: "#333333",
              fontFamily: "微软雅黑",
              fontSize: 12,
            },
          },
          axisTick: {
            show: false,
          },
          axisLine: {
            show: false,
            lineStyle: {
              color: "#273860",
            },
          },
          splitLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
        },
        series: [],
      };

      for (var index = 0; index < JBXXQYNL.data.length; index++) {
        options.series.push({
          name: JBXXQYNL.data[index].name,
          type: "bar",
          stack: "总量",
          barWidth: "30%",
          data: JBXXQYNL.data[index].value,
        });
        options.legend.data.push(JBXXQYNL.data[index].name);
      }
      //堆叠图柱子代码 大数据产业企业年龄数量分布-------------------------------------------------------------------------
    } else if (flag == "JBXX_QYYJNL") {
      //堆叠图柱子代码 大数据产业各一级环节企业年龄占比分布 4-------------------------------------------------------------------------
      var JBXX_QYYJNL = JSON.parse(params.data).JBXX_QYYJNL;
      options = {
        title: [
          {
            text: JBXX_QYYJNL.title,
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        color: ["#93beff", "#afabab", "#ffc63a", "#1d4edf", "#383b96"],
        legend: {
          data: JBXX_QYYJNL.categories,
          itemGap: 15,
          itemWidth: 10, // 设置宽度
          itemHeight: 10,
          top: "40",
          right: "30",
          textStyle: {
            color: "#333333",
          },
        },
        grid: {
          left: "4%",
          right: "4%",
          bottom: "8%",
          top: "12%",
          containLabel: true,
        },
        xAxis: [
          {
            name: "",
            type: "category",
            axisTick: {
              alignWithLabel: false,
            },
            axisLabel: {
              padding: [20, 0, 0, 0],
              interval: 0, // 可选项，根据需要调整显示间隔
              formatter: function (value) {
                if (value.length > 6) {
                  return value.substring(0, 6) + "\n" + value.substring(6);
                }
                return value;
              },
            },
            data: JBXX_QYYJNL.label,
          },
        ],
        yAxis: [
          {
            type: "value",
            max: 100,
            min: 0,
            axisLabel: {
              show: true,
              fontSize: 10,
              textStyle: {
                color: "#333333",
                fontStyle: "normal",
                fontSize: 12,
              },
              formatter: function (params) {
                console.log(params);
                return params + "%";
              },
            },
          },
        ],
        series: [],
      };

      // 数据抽出
      var datas = JBXX_QYYJNL.data;
      // 变量和循环处理
      var categories = JBXX_QYYJNL.categories;
      var years = JBXX_QYYJNL.year;
      for (var i = 0; i < years.length; i++) {
        var year = years[i];
        var yearData = datas[i]; // 获取对应年份的数据
        var seriesData = []; // 用于存储每个年份对应的系列数据
        for (var j = 0; j < categories.length; j++) {
          var itemData = [];
          for (var k = 0; k < yearData[j].length; k++) {
            itemData.push(yearData[j][k]);
          }
          seriesData.push({
            type: "bar",
            stack: "stack" + (i + 1),
            data: itemData,
            barGap: 0.5,
            barWidth: 25,
            label: {
              show: false,
              position: "insideTop",
              align: "center",
              formatter: function (param) {
                return param.value + "%";
              },
            },
            name: categories[j],
          });
        }
        options.series.push({
          type: "bar",
          stack: "stack" + (i + 1),
          data: [0, 0, 0, 0, 0],
          label: {
            show: true,
            formatter: year,
            position: "bottom",
          },
        });
        Array.prototype.push.apply(options.series, seriesData);
      }
      //堆叠图柱子代码 大数据产业各一级环节企业年龄占比分布-------------------------------------------------------------------------
    } else if (flag == "JBXXZDQYZB") {
      var JBXXZDQYZB = JSON.parse(params.data).JBXXZDQYZB;
      //4个环形 大数据产业重点企业占比分布 5-------------------------------------------------------------------------
      options = {
        color: [
          "#00EBFC",
          "#1F6CFE",
          "#87bfff",
          "#FF63D3",
          "#FF5858",
          "#FFA44E",
          "#FFFF41",
          "#75FD43",
          "#D6A3D3",
        ],
        series: [
          {
            type: "pie",
            clockWise: false, //顺时加载
            // hoverAnimation: false, //鼠标移入变大
            radius: ["62%", "80%"],
            center: ["45%", "50%"],
            label: {
              show: true,
              position: "outside",
              fontSize: 18,
              fontWeight: 700,
              color: "#fff",
              padding: [15, 10, 10, 10],
              backgroundColor: "#024be8",
              formatter: JBXXZDQYZB[0].name + " : " + JBXXZDQYZB[0].value + "%",
              borderRadius: 4,
            },
            labelLayout: {
              x: 350,
              y: 80,
              verticalAlign: "middle",
              align: "left",
              labelLinePoints: [
                [350, 80],
                [250, 80],
                [250, 80],
              ],
            },
            data: [
              {
                value: 0,
                itemStyle: {
                  color: "#024be8",
                },
              },
              {
                value: 120,
                name: "数据1",
                itemStyle: {
                  color: "#024be8",
                },
                tooltip: {
                  show: false,
                },
                label: {
                  show: false,
                },
                labelLine: {
                  show: false,
                },
              },
              {
                value: 248,
                itemStyle: {
                  color: "rgba(0,0,0,0)",
                },
                tooltip: {
                  show: false,
                },
                label: {
                  show: false,
                },
              },
            ],
          },
          {
            type: "pie",
            clockWise: false, //顺时加载
            // hoverAnimation: false, //鼠标移入变大
            radius: ["42.5%", "59.5%"],
            center: ["45%", "50%"],
            label: {
              show: true,
              position: "outside",
              fontWeight: 700,
              fontSize: 18,
              color: "#fff",
              padding: [15, 10, 10, 10],
              backgroundColor: "#383b96",
              formatter: JBXXZDQYZB[1].name + " : " + JBXXZDQYZB[1].value + "%",
              borderRadius: 4,
            },
            labelLayout: {
              x: 350,
              y: 135,
              verticalAlign: "middle",
              align: "left",
              labelLinePoints: [
                [350, 135],
                [250, 135],
                [250, 135],
              ],
            },
            data: [
              {
                value: 0,
                itemStyle: {
                  color: "#383b96",
                },
              },
              {
                value: 120,
                name: "数据1",
                itemStyle: {
                  color: "#383b96",
                },
                tooltip: {
                  show: false,
                },
                label: {
                  show: false,
                },
              },
              {
                value: 248,
                itemStyle: {
                  color: "rgba(0,0,0,0)",
                },
                tooltip: {
                  show: false,
                },
                label: {
                  show: false,
                },
              },
            ],
          },
          {
            type: "pie",
            clockWise: false, //顺时加载
            // hoverAnimation: false, //鼠标移入变大
            radius: ["22%", "40%"],
            center: ["45%", "50%"],
            label: {
              show: true,
              position: "outside",
              fontWeight: 700,
              fontSize: 18,
              color: "#fff",
              padding: [15, 10, 10, 10],
              backgroundColor: "#87bfff",
              formatter: JBXXZDQYZB[2].name + " : " + JBXXZDQYZB[2].value + "%",
              borderRadius: 4,
            },
            labelLayout: {
              x: 350,
              y: 190,
              verticalAlign: "middle",
              align: "left",
              labelLinePoints: [
                [350, 190],
                [250, 190],
                [250, 190],
              ],
            },
            data: [
              {
                value: 0,
                itemStyle: {
                  color: "#87bfff",
                },
              },
              {
                value: 120,
                name: "数据1",
                itemStyle: {
                  color: "#87bfff",
                },
                tooltip: {
                  show: false,
                },
                label: {
                  show: false,
                },
              },
              {
                value: 248,
                itemStyle: {
                  color: "rgba(0,0,0,0)",
                },
                tooltip: {
                  show: false,
                },
                label: {
                  show: false,
                },
              },
            ],
          },
          {
            type: "pie",
            clockWise: false, //顺时加载
            // hoverAnimation: false, //鼠标移入变大
            radius: ["0", "19.5%"],
            center: ["45%", "50%"],
            label: {
              show: true,
              position: "outside",
              fontWeight: 700,
              fontSize: 18,
              color: "#fff",
              padding: [15, 10, 10, 10],
              backgroundColor: "#ffc63a",
              formatter: JBXXZDQYZB[3].name + " : " + JBXXZDQYZB[3].value + "%",
              borderRadius: 4,
            },
            labelLayout: {
              x: 350,
              y: 250,
              verticalAlign: "middle",
              align: "left",
              labelLinePoints: [
                [350, 250],
                [250, 250],
                [250, 250],
              ],
            },
            data: [
              {
                value: 0,
                itemStyle: {
                  color: "#ffc63a",
                },
              },
              {
                value: 120,
                name: "数据2",
                itemStyle: {
                  color: "#ffc63a",
                },
                tooltip: {
                  show: false,
                },
                label: {
                  show: false,
                },
              },
              {
                value: 248,
                itemStyle: {
                  color: "rgba(0,0,0,0)",
                },
                tooltip: {
                  show: false,
                },
                label: {
                  show: false,
                },
              },
            ],
          },
        ],
      };
      //4个环形-------------------------------------------------------------------------
    } else if (flag == "JBXXSSQY") {
      //饼图带展开 相城区大数据上市企业分析 6-------------------------------------------------------------------------
      var JBXXSSQY = JSON.parse(params.data).JBXXSSQY;
      var pieData = JBXXSSQY.pieData;
      var pieTotal = pieData.reduce(function (total, item) {
        return total + item.value;
      }, 0);
      var pieInnerRate = pieData[0].value / pieTotal;

      var partData = JBXXSSQY.partData;
      var boxConfig = {
        width: params.width,
        height: params.height,
        circleWidth1: 0.7,
        circleWidth2: 0.9,
        moreLeft: 0.6,
        moreRight: 0.1,
        moreTop: 0.3,
        moreBottom: 0.3,
      };
      var pieRL =
        boxConfig.width / 4 > boxConfig.height / 2
          ? boxConfig.height / 2
          : boxConfig.width / 4;
      var pieRWidth = pieRL * boxConfig.circleWidth2;

      var pointsPosition = [
        [
          0.25 * boxConfig.width +
            pieRWidth * Math.cos((pieInnerRate / 2) * 2 * Math.PI),
          0.5 * boxConfig.height -
            pieRWidth * Math.sin((pieInnerRate / 2) * 2 * Math.PI),
        ],
        [
          boxConfig.moreLeft * boxConfig.width,
          boxConfig.moreTop * boxConfig.height,
        ],
        [
          boxConfig.moreLeft * boxConfig.width,
          (1 - boxConfig.moreBottom) * boxConfig.height,
        ],
        [
          0.25 * boxConfig.width +
            pieRWidth * Math.cos((pieInnerRate / 2) * 2 * Math.PI),
          0.5 * boxConfig.height +
            pieRWidth * Math.sin((pieInnerRate / 2) * 2 * Math.PI),
        ],
        [0.25 * boxConfig.width + pieRWidth, 0.5 * boxConfig.height],
      ];
      var pielegend = [];
      for (var s = 0; s < pieData.length; s++) {
        pielegend.push(pieData[s].name);
      }
      options = {
        backgroundColor: "",
        title: [
          {
            text: JBXXSSQY.title,
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#333333",
          },
          bottom: 20,
          data: pielegend,
        },
        tooltip: {
          show: false,
        },
        xAxis: {
          show: false,
        },
        yAxis: {
          show: false,
        },
        series: [
          {
            left: 0,
            right: "50%",
            top: 0,
            bottom: 0,
            startAngle: (pieInnerRate / 2) * 360,
            name: "半径模式",
            type: "pie",
            color: ["rgb(255,198,58)", "rgb(56,59,150)"],
            radius: ["0", "90%"],
            center: ["50%", "50%"],
            data: pieData,
            itemStyle: {
              borderColor: "#fff",
              borderWidth: 2,
            },
            label: {
              show: true,
              position: "inside",
              fontSize: 14,
              formatter: function (param) {
                console.log(param);
                return param.name + " , " + param.value;
              },
              borderRadius: 4,
            },
            labelLine: {
              show: false,
            },
          },
          {
            left: "60%",
            right: "25%",
            top: "30%",
            bottom: "30%",
            type: "funnel",
            minSize: "100%",
            color: ["rgb(147,190,255)", "rgb(29,78,223)", "rgb(55,60,151)"],
            data: partData,
            label: {
              show: true,
              fontSize: 14,
              color: "black",
            },
            labelLine: {
              show: false,
            },
          },
          {
            type: "custom",
            renderItem: function (params) {
              return {
                type: "polygon",
                shape: {
                  points: pointsPosition,
                  // [[481.6628903704161,217.74636072278963],[661.1999999999999,213.29999999999998],[661.1999999999999,497.7],[481.6628903704161,493.25363927721037],[523.45,355.5]]
                },
                style: {
                  fill: "rgba(0,122,255,0)",
                  stroke: "#ccc",
                },
              };
            },
            clip: true,
            seriesIndex: "2",
            data: [0],
          },
        ],
      };

      //饼图带展开-------------------------------------------------------------------------
    } else if (flag == "ZSCQZLZL") {
      //相城区大数据产业年度新增专利授权情况 柱图+折现 7-------------------------------------------------------------------------
      var ZSCQZLZL = JSON.parse(params.data).ZSCQZLZL;
      options = {
        color: ["#373c97", "#d0cece", "#ffc63a", "#3c66e3"],
        title: [
          {
            text: ZSCQZLZL.title,
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#333333",
          },
          bottom: 20,
          data: [],
        },
        grid: {
          left: "4%",
          right: "6%",
          bottom: "12%",
          top: "12%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          axisLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
          axisTick: {
            show: false,
          },

          axisLabel: {
            show: true, //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            margin: 15,
            textStyle: {
              color: "#333333",
              fontStyle: "normal",
              fontSize: 12,
            },
          },
          data: ZSCQZLZL.date,
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
              textStyle: {
                color: "#333333",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param + "%";
              },
            },
            min: 0,
            max: 100,
            name: "各专利类别占比%",
            nameGap: 50, // y轴name与横纵坐标轴线的间距
            nameLocation: "middle", // y轴name处于y轴的什么位置

            nameTextStyle: {
              color: "#333333",
              fontSize: 14,
              fontWeight: 700,
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
              textStyle: {
                color: "#333333",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param + "%";
              },
            },
            min: 0,
            max: 100,
            name: "专利许可率%",
            nameGap: 50, // y轴name与横纵坐标轴线的间距
            nameLocation: "middle", // y轴name处于y轴的什么位置
            nameTextStyle: {
              color: "#333333",
              fontSize: 14,
              fontWeight: 700,
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              show: false,
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
        ],
        series: [],
      };
      var ZSCQZLZLData = ZSCQZLZL.data;
      for (var index = 0; index < ZSCQZLZLData.length; index++) {
        if (ZSCQZLZLData[index].name != "专利许可率") {
          options.series.push({
            name: ZSCQZLZLData[index].name,
            type: "bar",
            label: {
              show: true,
              position: "insideTop",
              formatter: function (param) {
                return ZSCQZLZLData[param.seriesIndex].label[param.dataIndex];
              },
            },
            stack: "总量",
            barWidth: "30%",
            data: ZSCQZLZLData[index].value,
          });
        } else {
          options.series.push({
            name: ZSCQZLZLData[index].name,
            type: "line",
            yAxisIndex: 1,
            showSymbol: false,
            symbol:
              "image://data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMSIgdmlld0JveD0iMCAwIDEwIDEiIHZpZXdCb3g9IjAgMCAxMCAxIj4KICA8cGF0aCBkPSJNMCAwaDEwVjFIMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJub25lIi8+Cjwvc3ZnPgo=",
            symbolSize: [1], // 控制线条的长度和宽度
            data: ZSCQZLZLData[index].label,
          });
        }

        options.legend.data.push(ZSCQZLZLData[index].name);
      }

      //相城区大数据产业年度新增专利授权情况 柱图+折现-------------------------------------------------------------------------
    } else if (flag == "ZSCQZLLXFL") {
      //2022年专利授权占比（按类别） 双环饼图 8-------------------------------------------------------------------------
      var ZSCQZLLXFL = JSON.parse(params.data).ZSCQZLLXFL;
      var data1 = ZSCQZLLXFL.qgData;
      var data2 = ZSCQZLLXFL.bdData;
      options = {
        title: {
          text: ZSCQZLLXFL.title,
          left: "center",
          top: "5%",
          textStyle: {
            fontSize: 18,
            fontWeight: "bold",
          },
        },
        series: [
          {
            name: "外环",
            type: "pie",
            color: ["#1d4edf", "#2e75b6", "#373c97"],
            radius: ["52%", "70%"],
            center: ["50%", "50%"],
            labelLine: {
              show: false,
            },
            data: data1,
            label: {
              show: true,
              position: "inside",
              formatter: "{b}\n{d}%",
            },
          },
          {
            name: "内环",
            color: ["#2e75b6", "#ffc63a", "#1d4edf"],
            type: "pie",
            radius: ["32%", "50%"],
            center: ["50%", "50%"],
            labelLine: {
              show: false,
            },
            data: data2,
            label: {
              show: true,
              position: "inside",
              formatter: "{b}\n{d}%",
            },
          },
        ],
        graphic: [
          {
            type: "text",
            left: "25%",
            bottom: "10%",
            style: {
              text: ZSCQZLLXFL.str[0],
              textAlign: "center",
              fill: "#333",
              fontSize: 14,
            },
          },
          {
            type: "text",
            left: "25%",
            bottom: "6%",
            style: {
              text: ZSCQZLLXFL.str[1],
              textAlign: "center",
              fill: "#333",
              fontSize: 14,
            },
          },
        ],
      };
      //2022年专利授权占比（按类别） 双环饼图-------------------------------------------------------------------------
    } else if (flag == "ZSCQZLSLZS") {
      //2017-(Y-1)相城区大数据产业各专利类别增速 折现+面积-------------------------------------------------------------------------
      var ZSCQZLSLZS = JSON.parse(params.data).ZSCQZLSLZS;
      options = {
        title: [
          {
            text: ZSCQZLSLZS.title,
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        grid: {
          left: "4%",
          right: "4%",
          bottom: "15%",
          top: "12%",
          containLabel: true,
        },
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,

          textStyle: {
            color: "#373c97",
          },
          bottom: 30,
          formatter: function (name) {
            return name.replace(/( 柱图| 折线图 )/g, "       ");
          },
          tooltip: {
            show: true,
          },
          data: [],
        },
        xAxis: [
          {
            type: "category",
            data: ZSCQZLSLZS.date,
          },
        ],
        yAxis: [
          {
            type: "value",
            axisLabel: {
              formatter: "{value}%",
            },
          },
          {
            axisLine: {
              show: false,
              lineStyle: {
                color: "#f2f2f2",
              },
            },
            splitLine: {
              show: false,
            },
            type: "value",
            axisLabel: {
              show: false,
              formatter: "{value}%",
            },
          },
        ],
        series: [],
      };

      var seriesDatas = ZSCQZLSLZS.data;
      var colorArea = ["#e7e6e6", "#fff8e5", "#c9deff"];
      var colorLine = ["#767171", "#ffc63a", "#1d4edf"];
      var areaLegendData = [];
      var lineLegendData = [];
      var barLegendData = [];
      for (var i = 0; i < seriesDatas.length; i++) {
        // 柱图系列
        options.series.push({
          name: seriesDatas[i].namebd + " 柱图",
          type: "bar",
          data: [],
        });
        // 面积图系列
        options.series.push({
          name: seriesDatas[i].namebd + " 面积图",
          type: "line",
          showSymbol: false,

          areaStyle: {
            color: colorArea[i],
          },
          itemStyle: {
            color: colorArea[i],
          },
          data: seriesDatas[i].databd,
        });

        // 折线图系列
        options.series.push({
          name: seriesDatas[i].namesj + "增速",
          type: "line",
          color: colorLine[i],
          data: seriesDatas[i].datasj,

          showSymbol: true,
          symbol:
            "image://data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMSIgdmlld0JveD0iMCAwIDEwIDEiIHZpZXdCb3g9IjAgMCAxMCAxIj4KICA8cGF0aCBkPSJNMCAwaDEwVjFIMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJub25lIi8+Cjwvc3ZnPgo=",
          symbolSize: [50, 50],
          yAxisIndex: 1,
        });
        barLegendData.push(seriesDatas[i].namebd + " 柱图");

        areaLegendData.push(seriesDatas[i].namebd);
        lineLegendData.push(seriesDatas[i].namesj + "增速");
      }
      options.legend.data = barLegendData.concat([""], lineLegendData);

      //2017-(Y-1)相城区大数据产业各专利类别增速 折现+面积-------------------------------------------------------------------------
    } else if (flag == "ZSCQZLHJPH") {
      //大数据产业各一级环节对专利类型的偏好 堆叠柱图2-------------------------------------------------------------------------
      var ZSCQZLHJPH = JSON.parse(params.data).ZSCQZLHJPH;
      options = {
        color: ["#d0cece", "#383b96", "#ffc63a"],
        title: [
          {
            text: ZSCQZLHJPH.title,
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        legend: {
          data: ["发明专利", "实用新型专利", "外观设计专利"],
          itemGap: 15,
          itemWidth: 10, // 设置宽度
          itemHeight: 10,
          bottom: "30",
          textStyle: {
            color: "#595959",
          },
        },
        grid: {
          left: "4%",
          right: "4%",
          bottom: "13%",
          top: "12%",
          containLabel: true,
        },
        xAxis: [
          {
            type: "category",
            axisTick: {
              alignWithLabel: false,
            },
            axisLabel: {
              padding: [25, 0, 0, 0],
            },
            data: ZSCQZLHJPH.cylName,
          },
        ],
        yAxis: [
          {
            type: "value",
            min: 0,
            max: 100,
            axisLabel: {
              formatter: function (params) {
                return params + "%";
              },
            },
          },
        ],
        series: [],
      };

      var datas = ZSCQZLHJPH.data;
      var cyllength = [];
      for (var i = 0; i < ZSCQZLHJPH.cylName.length; i++) {
        cyllength.push(0);
      }
      // 变量和循环处理
      var categories = ["发明专利", "实用新型专利", "外观设计专利"];
      var years = ZSCQZLHJPH.area;
      for (var i = 0; i < years.length; i++) {
        var year = years[i];
        var yearData = datas[i]; // 获取对应年份的数据
        var seriesData = []; // 用于存储每个年份对应的系列数据
        for (var j = 0; j < categories.length; j++) {
          var itemData = [];
          for (var k = 0; k < yearData[j].length; k++) {
            itemData.push(yearData[j][k]);
          }
          seriesData.push({
            type: "bar",
            stack: "stack" + (i + 1),
            barGap: 0.5,
            barWidth: 25,
            label: {
              show: false,
              position: "insideTop",
              align: "center",
              formatter: function (param) {
                return param.value + "%";
              },
            },
            data: itemData,
            name: categories[j],
          });
        }
        options.series.push({
          type: "bar",
          stack: "stack" + (i + 1),
          data: cyllength,
          label: {
            show: true,
            formatter: year,
            position: "bottom",
          },
        });
        Array.prototype.push.apply(options.series, seriesData);
      }

      //大数据产业各一级环节对专利类型的偏好 堆叠柱图2-------------------------------------------------------------------------
    } else if (flag == "ZSCQSB") {
      //相城区大数据产业商标增速（分环节） 堆叠柱图2-------------------------------------------------------------------------
      var ZSCQSB = JSON.parse(params.data).ZSCQSB;
      options = {
        color: ['#afabab', '#93beff', '#ffc63a', '#1d4edf', '#383b96'],
        title: [
          {
            text: ZSCQSB.title,
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#373c97",
          },
          bottom: 20,
          data: [],
        },
        grid: {
          left: "4%",
          right: "6%",
          bottom: "12%",
          top: "12%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          axisLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
          axisTick: {
            show: false,
          },

          axisLabel: {
            show: true, //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            margin: 15,
            textStyle: {
              color: "#373c97",
              fontStyle: "normal",
              fontSize: 12,
            },
          },
          data: ZSCQSB.date,
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
              textStyle: {
                color: "#373c97",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param + "%";
              },
            },
            min: 0,
            max: 100,
            name: "各一级环节商标数量占比（%）",
            nameGap: 50, // y轴name与横纵坐标轴线的间距
            nameLocation: "middle", // y轴name处于y轴的什么位置

            nameTextStyle: {
              color: "#333333",
              fontSize: 14,
              fontWeight: 700,
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』

              textStyle: {
                color: "#373c97",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param+ "%";
              },
            },
            name: "增速（%）",
            nameGap: 50, // y轴name与横纵坐标轴线的间距
            nameLocation: "middle", // y轴name处于y轴的什么位置
            nameTextStyle: {
              color: "#333333",
              fontSize: 14,
              fontWeight: 700,
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              show: false,
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
        ],
        series: [],
      };
      var ZSCQSBData = ZSCQSB.data;
      for (var index = 0; index < ZSCQSBData.length; index++) {
        if (ZSCQSBData[index].name != "商标总量增速") {
          options.series.push({
            name: ZSCQSBData[index].name,
            type: "bar",
            stack: "总量",
            label: {
              show: false,
              position: "insideTop",
            },
            barWidth: "30%",
            data: ZSCQSBData[index].label,
          });
        } else {
          options.series.push({
            name: ZSCQSBData[index].name,
            type: "line",
            yAxisIndex: 1,
            showSymbol: false,
            symbol:
              "image://data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMSIgdmlld0JveD0iMCAwIDEwIDEiIHZpZXdCb3g9IjAgMCAxMCAxIj4KICA8cGF0aCBkPSJNMCAwaDEwVjFIMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJub25lIi8+Cjwvc3ZnPgo=",
            symbolSize: [1], // 控制线条的长度和宽度
            data: ZSCQSBData[index].label,
          });
        }

        options.legend.data.push(ZSCQSBData[index].name);
      }

      //相城区大数据产业商标增速（分环节） 堆叠柱图2-------------------------------------------------------------------------
    } else if (flag == "ZSCQRZ") {
      //相城区大数据产业软著增速（分环节） 堆叠柱图2-------------------------------------------------------------------------
      var ZSCQRZ = JSON.parse(params.data).ZSCQRZ;
      options = {
        color: ['#afabab', '#93beff', '#ffc63a', '#1d4edf', '#383b96'],
        title: [
          {
            text: ZSCQRZ.title,
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#373c97",
          },
          bottom: 20,
          data: [],
        },
        grid: {
          left: "4%",
          right: "6%",
          bottom: "12%",
          top: "12%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          axisLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
          axisTick: {
            show: false,
          },

          axisLabel: {
            show: true, //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            margin: 15,
            textStyle: {
              color: "#373c97",
              fontStyle: "normal",
              fontSize: 12,
            },
          },
          data: ZSCQRZ.date,
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
              textStyle: {
                color: "#373c97",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param + "%";
              },
            },
            min: 0,
            max: 100,
            name: "各一级环节软著数量占比（%）",
            nameGap: 50, // y轴name与横纵坐标轴线的间距
            nameLocation: "middle", // y轴name处于y轴的什么位置

            nameTextStyle: {
              color: "#333333",
              fontSize: 14,
              fontWeight: 700,
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』

              textStyle: {
                color: "#373c97",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param+ "%";
              },
            },
            name: "增速（%）",
            nameGap: 50, // y轴name与横纵坐标轴线的间距
            nameLocation: "middle", // y轴name处于y轴的什么位置
            nameTextStyle: {
              color: "#333333",
              fontSize: 14,
              fontWeight: 700,
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              show: false,
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
        ],
        series: [],
      };
      var ZSCQRZData = ZSCQRZ.data;
      for (var index = 0; index < ZSCQRZData.length; index++) {
        if (ZSCQRZData[index].name != "软著总量增速") {
          options.series.push({
            name: ZSCQRZData[index].name,
            type: "bar",
            stack: "总量",
            label: {
              show: false,
              position: "insideTop",
            },
            barWidth: "30%",
            data: ZSCQRZData[index].label,
          });
        } else {
          options.series.push({
            name: ZSCQRZData[index].name,
            type: "line",
            yAxisIndex: 1,
            showSymbol: false,
            symbol:
              "image://data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMSIgdmlld0JveD0iMCAwIDEwIDEiIHZpZXdCb3g9IjAgMCAxMCAxIj4KICA8cGF0aCBkPSJNMCAwaDEwVjFIMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJub25lIi8+Cjwvc3ZnPgo=",
            symbolSize: [1], // 控制线条的长度和宽度
            data: ZSCQRZData[index].label,
          });
        }

        options.legend.data.push(ZSCQRZData[index].name);
      }

      //相城区大数据产业软著增速（分环节） 堆叠柱图2-------------------------------------------------------------------------
    } else if (flag == "13") {
      //大数据产业资本来源区域 大饼图-------------------------------------------------------------------------
      colors = [
        "#373c97",
        "#ffc63a",
        "#d0cece",
        "#7ecf69",
        "#636363",
        "#264478",
        "#7cafdd",
      ];
      var datas = [
        {
          value: 3,
          name: "采纳",
        },
        {
          value: 3,
          name: "不采纳",
        },
        {
          value: 4,
          name: "其他",
        },
      ];
      for (var i = 0; i < datas.length; i++) {
        datas[i].itemStyle = {
          color: colors[i],
          borderColor: "#fff",
          borderWidth: 2,
        };
      }
      options = {
        legend: {
          // type: 'scroll',
          orient: "vertical",
          right: "20%",
          top: "30%",
          icon: "rect",
          itemWidth: 15,
          itemHeight: 15,
          itemGap: 20,
          textStyle: {
            color: "rgba(0, 0, 0, 0.65)",
            rich: {
              name: {
                fontSize: 15,
                padding: [36, 0, 0, 0],
              },
              value: {
                fontSize: 15,
                color: "rgba(0, 0, 0, 0.85)",
                padding: [20, 0, 0, 0],
                fontWeight: 700,
              },
            },
          },
        },
        series: [
          {
            type: "pie",
            radius: ["0", "50%"],
            center: ["50%", "50%"],
            labelLine: {
              show: false,
            },
            label: {
              show: true,
              position: "inside",
              color: "#fff",
              formatter: function (param) {
                return param.name + "\n\n" + param.value + "%";
              },
            },
            itemStyle: {
              color: colors[0],
              borderColor: "#fff",
              borderWidth: 20,
            },
            data: datas,
          },
          {
            type: "pie",
            tooltip: {
              show: false,
            },
            clockWise: false, //顺时加载
            hoverAnimation: false, //鼠标移入变大
            center: ["50%", "50%"], //这里跟上面那组一样即可
            radius: ["50%", "50%"], //这里根据自己的需要自行调整，但是两个值要一样大哦，如果小于上方设置的最小内圆30%则为内阴影，大于外圆60%则为外阴影
            label: {
              normal: {
                show: false, //重点：此处主要是为了不展示data中的value和name
              },
            },
            data: [
              {
                value: 1, //此处的值无所谓是多少
                name: "", //因为不展示label，可不填
                itemStyle: {
                  //边框样式，此处我们设置的浅蓝色，颜色可自行修改
                  normal: {
                    borderWidth: 8, //边框宽度
                    borderColor: "rgba(94, 183, 249,  0.13)", //边框颜色
                  },
                },
              },
            ],
          },
        ],
      };

      //大数据产业资本来源区域 大饼图-------------------------------------------------------------------------
    } else if (flag == "ZSCQZBLYBDT") {
      var ZSCQZBLYBDT = JSON.parse(params.data).ZSCQZBLYBDT;
      //资本来源地区 矩阵图-------------------------------------------------------------------------
      
      var testData = [] 
      for(var i=0;i<ZSCQZBLYBDT.data.length;i++){
        testData.push({
          name:ZSCQZBLYBDT.data[i].name,
          value:ZSCQZBLYBDT.data[i].value
        })
      }
      var maxValue = Math.max.apply(Math, testData.map(function (obj) {
        return obj.value;
    }));
    
    // 获取最小值
    var minValue = Math.min.apply(Math, testData.map(function (obj) {
        return obj.value;
    }));
      options = {
        animation: false,
        calculable: false,
        visualMap: {
          show: false,
          max: maxValue,
          min: minValue,
          itemWidth: 20,
          itemHeight: 130,
          itemGap: 20,
          right: '15%',
          top: 10,
          align: 'left',
          orient: 'horizontal',
          inRange: {
              color: ['#3d90e9', '#003c83',] // 蓝绿
          }
      },
        title: [
          {
            text: '资本来源地区',
            left: 'left',
            textStyle: { color: '#373c97', fontSize: 22 }
          }
        ],
        series: [
          {
            type: 'treemap',
            left: '0',
            right: '20',
            top: '30',
            bottom: '20',
            itemStyle: {
               borderWidth: 2,
               boderColor: "#fff"
            },
            label: {
              normal: {
                show: true,
                position: 'insideTopLeft',
                formatter: function (param) {
                  return param.data.name + '\n\n' + param.data.value;
                },
                fontSize: 17,
                textStyle : {
                  color: '#fff'
              },
                ellipsis: true
              }
            },
            breadcrumb: {
              show: false
            },
            data: testData,
            roam: false,
            nodeClick: false,
            
          }
        ]
      };

      //资本来源地区 矩阵图-------------------------------------------------------------------------
    } else if (flag == "15") {
      //主要资本来源地区对各一级环节的偏好 横条图+堆叠-------------------------------------------------------------------------
      var objs = JSON.parse(
        '{"CYFBHB":{"zbdata":["航空装备产业","轨道交通装备产业","卫星及应用产业","海洋工程装备产业","智能制造装备产业"],"title":"2222","attaData2":[{"name":"1万-100万（含）","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]},{"name":"100万-500万（含）","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]},{"name":"500万-1000万（含）","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]}],"attaData1":{"name":"全国","label":["1.46","5.10","8.09","25.63","59.72"],"value":[2859,9963,15804,50084,116688]}}}'
        ).CYFBHB;
        
        var attaData1 = objs.attaData1;
        var attaData2 = objs.attaData2;
        var zbdata = objs.zbdata;
        var titles = objs.title;
        var colorList = ['#373c97','#d0cece','#ffc63a','#2e75b6','#7ecf69','#1d4edf','#80e4f9','#93beff']
        var legendDtata2 = []
        var serviesData = []
        for(var i = 0;i<attaData2.length;i++){
          legendDtata2.push(attaData2[i].name)
          serviesData.push(
             {
              name: attaData2[i].name,
              type: 'bar',
              barWidth: 12,
              zlevel: 2,
              itemStyle: {
                color: colorList[i]
              },
              stack: '总量',
              data: attaData2[i].label
            }
          )
        }
        options = {
          legend: {
            icon: 'rect',
            itemGap: 15,
            itemWidth: 10,
            itemHeight: 10,
            bottom: '3%',
            textStyle: {
              color: '#333333'
            },
            data: legendDtata2
          },
          title: {
            text: titles,
            left: 'center',
            textStyle: { color: '#373c97' }
          },
          grid: {
            left: "5%",
            right: "5%",
            bottom: "8%",
            top: "10%",
            containLabel: true
          },
          xAxis: {
            show: true,
            type: 'value',
            name: '单位:户',
            axisLine: {
              lineStyle: {
                color: 'rgba(255, 255, 255, 0.79)'
              }
            },
            axisLabel: {
              show: true,
              textStyle: {
                color: '#333333'
              },
              formatter: '{value}%' // 将刻度显示为百分比形式
            },
            axisTick: {
              show: true
            },
            splitLine: {
              show: true
            }
          },
          yAxis: {
            data: zbdata,
            axisLine: {
              show: false,
              lineStyle: {
                color: 'rgba(255, 255, 255, 0.79)'
              }
            },
            axisLabel: {
              textStyle: {
                color: '#333333'
              }
            },
            axisTick: {
              show: false
            },
            splitLine: {
              show: false
            }
          },
          series: serviesData
        };        

      //主要资本来源地区对各一级环节的偏好 横条图+堆叠-------------------------------------------------------------------------
    } else if (flag == "16") {
      //相城区大数据产业获得投资的企业规模占比（分地区） 横条图+堆叠-------------------------------------------------------------------------
      obj = JSON.parse(
        '{"CYFBHB":{"zbdata":["航空装备产业","轨道交通装备产业","卫星及应用产业","海洋工程装备产业","智能制造装备产业"],"attaData2":[{"name":"1万-100万（含）","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]},{"name":"100万-500万（含）","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]},{"name":"500万-1000万（含）","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]}],"attaData1":{"name":"全国","label":["1.46","5.10","8.09","25.63","59.72"],"value":[2859,9963,15804,50084,116688]}}}'
      ).CYFBHB;

      var attaData1 = obj.attaData1;
      var attaData2 = obj.attaData2;
      var zbdata = obj.zbdata;
      var colorList = [
        "#373c97",
        "#d0cece",
        "#ffc63a",
        "#2e75b6",
        "#7ecf69",
        "#1d4edf",
        "#80e4f9",
        "#93beff",
      ];
      var legendDtata = [
        "1万-100万（含）",
        "100万-500万（含）",
        "500万-1000万（含）",
        "1000万-5000万（含）",
        "5000万-1亿（含）",
        "1亿-5亿（含）",
        "5亿-10亿（含）",
        "10亿以上",
      ];
      var legendDtata2 = [];
      var serviesData = [];
      for (var i = 0; i < attaData2.length; i++) {
        legendDtata2.push(attaData2[i].name);
        serviesData.push({
          name: attaData2[i].name,
          type: "bar",
          barWidth: 12,
          zlevel: 2,
          itemStyle: {
            color: colorList[i],
          },
          label: {
            show: false,
            position: "insideRight", // 修改为堆叠在内部右侧
            formatter: function (params) {
              return attaData1.label[params.dataIndex] + "%";
            },
          },
          stack: "总量", // 堆叠设置为同一组
          data: attaData2[i].label,
        });
      }
      options = {
        legend: {
          icon: "rect",
          itemGap: 15,
          itemWidth: 10,
          itemHeight: 10,
          bottom: "3%",
          right: "45%",

          textStyle: {
            color: "#373c97",
          },
          data: legendDtata,
        },
        title: {
          text: "大数据产业各一级环节分布",
          left: "center",
          textStyle: { color: "#373c97" },
        },
        grid: {
          left: "5%",
          right: "5%",
          bottom: "8%",
          top: "10%",
          containLabel: true,
        },
        xAxis: {
          show: true,
          type: "value",
          name: "单位:户",
          axisLine: {
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            show: true,
            textStyle: {
              color: "#373c97",
            },
            formatter: "{value}%", // 将刻度显示为百分比形式
          },
          axisTick: {
            show: true,
          },
          splitLine: {
            show: true,
          },
        },
        yAxis: {
          data: zbdata,
          axisLine: {
            show: false,
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            textStyle: {
              color: "#808080",
            },
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
        },
        series: serviesData,
      };

      //相城区大数据产业获得投资的企业规模占比（分地区） 横条图+堆叠-------------------------------------------------------------------------
    } else if (flag == "17") {
      //大数据产业资本获投区域 大饼图-------------------------------------------------------------------------
      colors = [
        "#373c97",
        "#ffc63a",
        "#d0cece",
        "#7ecf69",
        "#636363",
        "#264478",
        "#7cafdd",
      ];
      var datas = [
        {
          value: 3,
          name: "采纳",
        },
        {
          value: 3,
          name: "不采纳",
        },
        {
          value: 4,
          name: "其他",
        },
      ];
      for (var i = 0; i < datas.length; i++) {
        datas[i].itemStyle = {
          color: colors[i],
          borderColor: "#fff",
          borderWidth: 2,
        };
      }
      options = {
        legend: {
          // type: 'scroll',
          orient: "vertical",
          right: "20%",
          top: "30%",
          icon: "rect",
          itemWidth: 15,
          itemHeight: 15,
          itemGap: 20,
          textStyle: {
            color: "rgba(0, 0, 0, 0.65)",
            rich: {
              name: {
                fontSize: 15,
                padding: [36, 0, 0, 0],
              },
              value: {
                fontSize: 15,
                color: "rgba(0, 0, 0, 0.85)",
                padding: [20, 0, 0, 0],
                fontWeight: 700,
              },
            },
          },
        },
        series: [
          {
            type: "pie",
            radius: ["0", "50%"],
            center: ["50%", "50%"],
            labelLine: {
              show: false,
            },
            label: {
              show: true,
              position: "inside",
              color: "#fff",
              formatter: function (param) {
                console.log(param);
                return param.name + "\n\n" + param.value + "%";
              },
            },
            itemStyle: {
              color: colors[0],
              borderColor: "#fff",
              borderWidth: 20,
            },
            data: datas,
          },
          {
            type: "pie",
            tooltip: {
              show: false,
            },
            clockWise: false, //顺时加载
            hoverAnimation: false, //鼠标移入变大
            center: ["50%", "50%"], //这里跟上面那组一样即可
            radius: ["50%", "50%"], //这里根据自己的需要自行调整，但是两个值要一样大哦，如果小于上方设置的最小内圆30%则为内阴影，大于外圆60%则为外阴影
            label: {
              normal: {
                show: false, //重点：此处主要是为了不展示data中的value和name
              },
            },
            data: [
              {
                value: 1, //此处的值无所谓是多少
                name: "", //因为不展示label，可不填
                itemStyle: {
                  //边框样式，此处我们设置的浅蓝色，颜色可自行修改
                  normal: {
                    borderWidth: 8, //边框宽度
                    borderColor: "rgba(94, 183, 249,  0.13)", //边框颜色
                  },
                },
              },
            ],
          },
        ],
      };

      //大数据产业资本获投区域 大饼图-------------------------------------------------------------------------
    } else if (flag == "ZSCQZBLYBDTCT") {
      var ZSCQZBLYBDTCT = JSON.parse(params.data).ZSCQZBLYBDTCT;
      //资本来源地区 矩阵图-------------------------------------------------------------------------
      
      var testData = [] 
      for(var i=0;i<ZSCQZBLYBDTCT.data.length;i++){
        testData.push({
          name:ZSCQZBLYBDTCT.data[i].name,
          value:ZSCQZBLYBDTCT.data[i].value
        })
      }
      var maxValue = Math.max.apply(Math, testData.map(function (obj) {
        return obj.value;
    }));
    
    // 获取最小值
    var minValue = Math.min.apply(Math, testData.map(function (obj) {
        return obj.value;
    }));
      options = {
        animation: false,
        calculable: false,
        visualMap: {
          show: false,
          max: maxValue,
          min: minValue,
          itemWidth: 20,
          itemHeight: 130,
          itemGap: 20,
          right: '15%',
          top: 10,
          align: 'left',
          orient: 'horizontal',
          inRange: {
              color: ['#3d90e9', '#003c83',] // 蓝绿
          }
      },
        title: [
          {
            text: '资本投向地区',
            left: 'left',
            textStyle: { color: '#373c97', fontSize: 22 }
          }
        ],
        series: [
          {
            type: 'treemap',
            left: '0',
            right: '20',
            top: '30',
            bottom: '20',
            itemStyle: {
               borderWidth: 2,
               boderColor: "#fff"
            },
            label: {
              normal: {
                show: true,
                position: 'insideTopLeft',
                formatter: function (param) {
                  return param.data.name + '\n\n' + param.data.value;
                },
                fontSize: 17,
                textStyle : {
                  color: '#fff'
              },
                ellipsis: true
              }
            },
            breadcrumb: {
              show: false
            },
            data: testData,
            roam: false,
            nodeClick: false,
            
          }
        ]
      };

      //资本来源地区 矩阵图-------------------------------------------------------------------------
     } else if (flag == "19") {
      //相城区投出资本对各一级环节偏好（分地区） 横条图+堆叠-------------------------------------------------------------------------
      var obj = JSON.parse(
        '{"CYFBHB":{"zbdata":["浙江","广东","北京","上海","江苏"],"attaData2":[{"name":"基础支持层","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]},{"name":"大数据服务","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]},{"name":"大数据英语","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]}]}}'
      ).CYFBHB;
      var attaData2 = obj.attaData2;
      var zbdata = obj.zbdata;
      var colorList = [
        "#373c97",
        "#d0cece",
        "#ffc63a",
        "#2e75b6",
        "#7ecf69",
        "#1d4edf",
        "#80e4f9",
        "#93beff",
      ];
      var legendDtata = [
        "1万-100万（含）",
        "100万-500万（含）",
        "500万-1000万（含）",
        "1000万-5000万（含）",
        "5000万-1亿（含）",
        "1亿-5亿（含）",
        "5亿-10亿（含）",
        "10亿以上",
      ];
      var legendDtata2 = [];
      var serviesData = [];
      for (var i = 0; i < attaData2.length; i++) {
        legendDtata2.push(attaData2[i].name);
        serviesData.push({
          name: attaData2[i].name,
          type: "bar",
          barWidth: 12,
          zlevel: 2,
          itemStyle: {
            color: colorList[i],
          },
          label: {
            show: false,
            position: "insideRight", // 修改为堆叠在内部右侧
            formatter: function (params) {
              return attaData1.label[params.dataIndex] + "%";
            },
          },
          stack: "总量", // 堆叠设置为同一组
          data: attaData2[i].label,
        });
      }
      options = {
        legend: {
          icon: "rect",
          itemGap: 15,
          itemWidth: 10,
          itemHeight: 10,
          bottom: "3%",
          right: "45%",

          textStyle: {
            color: "#373c97",
          },
          data: legendDtata2,
        },
        title: {
          text: "大数据产业各一级环节分布",
          left: "center",
          textStyle: { color: "#373c97" },
        },
        grid: {
          left: "5%",
          right: "5%",
          bottom: "8%",
          top: "10%",
          containLabel: true,
        },
        xAxis: {
          show: true,
          type: "value",
          name: "单位:户",
          axisLine: {
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            show: true,
            textStyle: {
              color: "#373c97",
            },
            formatter: "{value}%", // 将刻度显示为百分比形式
          },
          axisTick: {
            show: true,
          },
          splitLine: {
            show: true,
          },
        },
        yAxis: {
          data: zbdata,
          axisLine: {
            show: false,
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            textStyle: {
              color: "#808080",
            },
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
        },
        series: serviesData,
      };

      //相城区投出资本对各一级环节偏好（分地区） 横条图+堆叠-------------------------------------------------------------------------
    } else if (flag == "20") {
      //对标地区企业数量及环节分布、 柱图+堆叠-------------------------------------------------------------------------
      var JBXXQYNL = JSON.parse(
        '{"JBXXQYNL":[{"name":"11","value":[15,30,40,12,77]},{"name":"22","value":[22,23,25,66,23]},{"name":"33","value":[15,20,30,60,70]}]}'
      ).JBXXQYNL;
      option = {
        color: ["#fac858", "#383b96", "#d0cece", "#D5B829", "#DB611A"],
        title: [
          { text: "123123", left: "center", textStyle: { color: "#373c97" } },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#373c97",
          },
          bottom: 0,
          data: [],
        },
        grid: {
          left: "4%",
          right: "4%",
          bottom: "3%",
          top: "12%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          axisLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
          axisTick: {
            show: false,
          },

          axisLabel: {
            show: true, //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            margin: 15,
            textStyle: {
              color: "#373c97",
              fontStyle: "normal",
              fontSize: 12,
            },
          },
          data: ["1年内", "1-3年", "3-5年", "5-10年", "10年以上"],
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
              textStyle: {
                color: "#373c97",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param + "%";
              },
            },
            min: 0,
            max: 100,
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』

              textStyle: {
                color: "#373c97",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param + "%";
              },
            },
            min: 0,
            max: 100,
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              show: false,
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
        ],
        series: [],
      };

      for (var index = 0; index < JBXXQYNL.length; index++) {
        option.series.push({
          name: JBXXQYNL[index].name,
          type: "bar",
          stack: "总量",
          label: {
            show: true,
            position: "insideTop",
          },
          barWidth: "30%",
          data: JBXXQYNL[index].value,
        });

        option.legend.data.push(JBXXQYNL[index].name);
      }

      //对标地区企业数量及环节分布 柱图+堆叠-------------------------------------------------------------------------
    } else if (flag == "21") {
      //2016年至（T-1）年各地区企业数量及增速对比 柱图+折现-------------------------------------------------------------------------
      options = {
        title: [
          {
            text: "2016年至（T-1）年各地区企业数量及增速对比",
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        legend: {
          data: ["城市1", "城市2"],
          itemGap: 15,
          itemWidth: 10, // 设置宽度
          itemHeight: 10,
          bottom: 0,
          textStyle: {
            color: "#373c97",
          },
        },
        xAxis: [
          {
            type: "category",
            data: ["2016", "2017", "2018", "2019", "2020", "2021", "2022"],
          },
        ],
        yAxis: [
          {
            type: "value",
          },
          {
            type: "value",
            splitLine: { show: false },
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              margin: 2,
              interval: 10,
              color: "#999999",
            },
          },
        ],
        series: [],
      };

      var seriesDatas = [
        {
          name: "城市1",
          dataBar: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
          dataLine: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
        },
        {
          name: "城市2",
          dataBar: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
          dataLine: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
        },
        {
          name: "城市3",
          dataBar: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
          dataLine: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
        },
        {
          name: "城市4",
          dataBar: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
          dataLine: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
        },
        {
          name: "城市5",
          dataBar: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
          dataLine: [122, 125, 80, 15, 89, 17, 135, 162, 32, 20, 6, 3],
        },
      ];
      options.legend.data = [];
      options.series = [];

      options.legend = {
        itemGap: 15,
        itemWidth: 20,
        itemHeight: 10,
        textStyle: {
          color: "#373c97",
        },
        bottom: 0,
        formatter: function (name) {
          console.log(name);
          return name.replace(/( 柱图| 折线图 )/g, "       ");
        },

        tooltip: {
          show: true,
        },
        data: [],
      };

      var barLegendData = [];
      var lineLegendData = [];

      for (var i = 0; i < seriesDatas.length; i++) {
        // 柱图系列
        options.series.push({
          name: seriesDatas[i].name + " 柱图",
          type: "bar",
          data: seriesDatas[i].dataBar,
        });

        // 折线图系列
        options.series.push({
          name: seriesDatas[i].name + "增速",
          type: "line",
          data: seriesDatas[i].dataLine,
          showSymbol: false,
          symbol:
            "image://data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMSIgdmlld0JveD0iMCAwIDEwIDEiIHZpZXdCb3g9IjAgMCAxMCAxIj4KICA8cGF0aCBkPSJNMCAwaDEwVjFIMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJub25lIi8+Cjwvc3ZnPgo=",
          symbolSize: [1], // 控制线条的长度和宽度
          yAxisIndex: 1,
        });

        barLegendData.push(seriesDatas[i].name + " 柱图");
        lineLegendData.push(seriesDatas[i].name + "增速");
      }

      option.legend.data = barLegendData.concat([""], lineLegendData);
      //2016年至（T-1）年各地区企业数量及增速对比 柱图+折现-------------------------------------------------------------------------
    } else if (flag == "22") {
      //大数据产业对标地区企业数量及增速对比 雷达图-------------------------------------------------------------------------
      var lengData = ["a组", "b组", "c组", "d组"];
      var indicators = [
        // 上
        {
          text: "≤200w",
          max: 100,
          min: 0,
          color: "#515151",
          index: 0,
        },
        // 左
        {
          text: "200w-500w",
          max: 100,
          min: 0,
          color: "#515151",
          index: 1,
        },
        // 下
        {
          text: "500w-1000w",
          max: 100,
          min: 0,
          color: "#515151",
          index: 2,
        },
        // 右
        {
          text: ">1000w",
          max: 100,
          min: 0,
          color: "#515151",
          index: 3,
        },
      ];
      options = {
        legend: {
          data: lengData,
          itemGap: 15,
          itemWidth: 10, // 设置宽度
          itemHeight: 10,
          bottom: 80,
          textStyle: {
            color: "#373c97",
          },
        },
        radar: [
          {
            name: {
              formatter: function (value) {
                return "{title|" + value + "}";
              },
              color: "#fff",
              rich: {
                title: {
                  fontSize: 15,
                  borderRadius: 3,
                  padding: [6, 10],
                },
              },
            },
            // 坐标轴线
            axisLine: {
              lineStyle: {
                color: "#b3ddfb",
              },
            },
            // 刻度
            axisTick: {
              show: false,
              length: 6,
            },
            // 刻度标签
            axisLabel: {
              show: true,
              formatter: function (param) {
                return param + "%";
              },
              color: "#c8c8c8",
            },
            // 分割线
            splitLine: {
              lineStyle: {
                color: "#c8c8c8",
              },
            },
            // 分割区域
            splitArea: {
              areaStyle: {
                color: ["#fefefe", "#f6f8fc"],
              },
            },
            indicator: indicators,
            center: ["50%", "50%"],
            radius: 200,
          },
        ],
        series: [],
        backgroundColor: "#fff",
      };
      // 上左下右
      var data = [
        [55, 77, 29, 66],
        [44, 66, 11, 33],
        [88, 99, 34, 53],
        [34, 25, 11, 33],
      ];
      var areaStyle = ["#fff3da", "#d6cdcd", "#bdb9c6", "#c6c8ba"];
      var lineStyle = ["#ffc93c", "#373b9a", "#6876b2", "#8bb572"];
      var itemStyle = ["#ffc63a", "#383b96", "#4d70cc", "#7ecf69"];
      var datas = [];
      for (var i = 0; i < data.length; i++) {
        datas.push({
          value: data[i],
          name: lengData[i],
          areaStyle: {
            color: areaStyle[i],
          },
          lineStyle: {
            color: lineStyle[i],
          },
          itemStyle: {
            color: itemStyle[i],
            borderType: "solid",
          },
        });
      }
      options.series.push({
        type: "radar",
        label: {
          normal: {
            show: true,
            position: "top",
            formatter: function (params) {
              // let value = `${params.value}%`;
              // let text = `${value}`;
              // return text;
              // let value = `${params.value}%`;
              // let text = `${value}`;
              return params.value + "%";
            },
          },
        },
        areaStyle: {},
        data: datas,
      });

      //大数据产业对标地区企业数量及增速对比 雷达图-------------------------------------------------------------------------
    } else if (flag == "23") {
      //各地区大数据产业企业年龄分布 横条+堆叠-------------------------------------------------------------------------
      var objdata = JSON.parse(
        '{"CYFBHB":{"zbdata":["浙江","广东","北京","上海","江苏"],"attaData2":[{"name":"1","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]},{"name":"大数据服务","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]},{"name":"大数据英语","label":["35.51","9.42","12.80","18.48","29.83"],"value":[294,78,106,153,247]}]}}'
      ).CYFBHB;
      var attaData2 = objdata.attaData2;
      var zbdata = objdata.zbdata;
      var colorList = ["#373c97", "#d0cece", "#ffc63a", "#7ecf69", "#1d4edf"];
      var legendDtata2 = [];
      var serviesData = [];
      for (var i = 0; i < attaData2.length; i++) {
        legendDtata2.push(attaData2[i].name);
        serviesData.push({
          name: attaData2[i].name,
          type: "bar",
          barWidth: 12,
          zlevel: 2,
          itemStyle: {
            color: colorList[i],
          },
          label: {
            show: false,
            position: "insideRight", // 修改为堆叠在内部右侧
            formatter: function (params) {
              return attaData1.label[params.dataIndex] + "%";
            },
          },
          stack: "总量", // 堆叠设置为同一组
          data: attaData2[i].label,
        });
      }
      options = {
        legend: {
          icon: "rect",
          itemGap: 15,
          itemWidth: 10,
          itemHeight: 10,
          bottom: "3%",
          right: "45%",
          textStyle: {
            color: "#373c97",
          },
          data: legendDtata2,
        },
        title: {
          text: "大数据产业各一级环节分布",
          left: "center",
          textStyle: { color: "#373c97" },
        },
        grid: {
          left: "5%",
          right: "5%",
          bottom: "8%",
          top: "10%",
          containLabel: true,
        },
        xAxis: {
          show: true,
          type: "value",
          name: "单位:户",
          axisLine: {
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            show: true,
            textStyle: {
              color: "#373c97",
            },
            formatter: "{value}%", // 将刻度显示为百分比形式
          },
          axisTick: {
            show: true,
          },
          splitLine: {
            show: true,
          },
        },
        yAxis: {
          data: zbdata,
          axisLine: {
            show: false,
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            textStyle: {
              color: "#808080",
            },
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
        },
        series: serviesData,
      };

      //各地区大数据产业企业年龄分布 横条+堆叠-------------------------------------------------------------------------
    } else if (flag == "24") {
      //大数据产业各地区重点企业数量 柱图+堆叠-------------------------------------------------------------------------
      var JBXXQYNL = JSON.parse(
        '{"JBXXQYNL":[{"name":"11","value":[15,30,40,12,77]},{"name":"22","value":[22,23,25,66,23]},{"name":"33","value":[15,20,30,60,70]}]}'
      ).JBXXQYNL;
      options = {
        color: ["#383b96", "#fac858", "#d0cece", "#D5B829", "#DB611A"],
        title: [
          { text: "123123", left: "center", textStyle: { color: "#373c97" } },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#373c97",
          },
          bottom: 0,
          data: [],
        },
        grid: {
          left: "4%",
          right: "4%",
          bottom: "3%",
          top: "12%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          axisLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
          axisTick: {
            show: false,
          },

          axisLabel: {
            show: true, //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            margin: 15,
            textStyle: {
              color: "#373c97",
              fontStyle: "normal",
              fontSize: 12,
            },
          },
          data: ["1年内", "1-3年", "3-5年", "5-10年", "10年以上"],
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
              textStyle: {
                color: "#373c97",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
          {
            type: "value",
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              show: false,
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
        ],
        series: [],
      };

      for (var index = 0; index < JBXXQYNL.length; index++) {
        options.series.push({
          name: JBXXQYNL[index].name,
          type: "bar",
          stack: "总量",
          label: {
            show: true,
            position: "insideTop",
          },
          barWidth: "30%",
          data: JBXXQYNL[index].value,
        });

        options.legend.data.push(JBXXQYNL[index].name);
      }

      //大数据产业各地区重点企业数量 柱图+堆叠-------------------------------------------------------------------------
    } else if (flag == "25") {
      //潜在重点企业数量 横条-------------------------------------------------------------------------
      obj = JSON.parse(
        '{"CYFBHB":{"zbdata":["航空装备产业","轨道交通装备产业","卫星及应用产业","海洋工程装备产业","智能制造装备产业"],"attaData1":{"name":"全国","label":["1.46","5.10","8.09","25.63","59.72"],"value":[2859,9963,15804,50084,116688]}}}'
      ).CYFBHB;

      var attaData1 = obj.attaData1;
      var zbdata = obj.zbdata;

      options = {
        title: {
          text: "大数据产业各一级环节分布",
          left: "center",
          textStyle: { color: "#373c97" },
        },
        grid: {
          left: "5%",
          right: "5%",
          bottom: "8%",
          top: "10%",
          containLabel: true,
        },
        xAxis: {
          show: true,
          type: "value",
          name: "单位:户",
          axisLine: {
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            show: true,
            textStyle: {
              color: "#373c97",
            },
          },
          axisTick: {
            show: true,
          },
          splitLine: {
            show: true,
          },
        },
        yAxis: {
          data: zbdata,
          axisLine: {
            show: false,
            lineStyle: {
              color: "rgba(255, 255, 255, 0.79)",
            },
          },
          axisLabel: {
            textStyle: {
              color: "#808080",
            },
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
        },
        series: [
          {
            name: attaData1.name,
            type: "bar",
            barWidth: 12,
            zlevel: 2,
            itemStyle: {
              color: "#383b96",
            },
            label: {
              show: false,
              position: "insideRight", // 修改为堆叠在内部右侧
              formatter: function (params) {
                return attaData1.label[params.dataIndex] + "%";
              },
            },
            stack: "总量", // 堆叠设置为同一组
            data: attaData1.value,
          },
        ],
      };

      //潜在重点企业数量 横条-------------------------------------------------------------------------
    } else if (flag == "26") {
      //各地区知识产权数量及占比对比 柱图+堆叠-------------------------------------------------------------------------
      var JBXXQYNL = JSON.parse(
        '{"JBXXQYNL":[{"name":"11","value":[15,30,40,12,77]},{"name":"22","value":[22,23,25,66,23]},{"name":"33","value":[15,20,30,60,70]}]}'
      ).JBXXQYNL;
      options = {
        color: ["#373c97", "#1d4edf", "#ffc63a", "#d0cece", "#93beff"],
        title: [
          { text: "123123", left: "center", textStyle: { color: "#373c97" } },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#373c97",
          },
          bottom: 0,
          data: [],
        },
        grid: {
          left: "4%",
          right: "4%",
          bottom: "3%",
          top: "12%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          axisLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
          axisTick: {
            show: false,
          },

          axisLabel: {
            show: true, //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            margin: 15,
            textStyle: {
              color: "#373c97",
              fontStyle: "normal",
              fontSize: 12,
            },
          },
          data: ["1年内", "1-3年", "3-5年", "5-10年", "10年以上"],
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
              textStyle: {
                color: "#373c97",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
          {
            type: "value",
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              show: false,
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
        ],
        series: [],
      };

      for (var index = 0; index < JBXXQYNL.length; index++) {
        options.series.push({
          name: JBXXQYNL[index].name,
          type: "bar",
          stack: "总量",
          label: {
            show: true,
            position: "insideTop",
          },
          barWidth: "30%",
          data: JBXXQYNL[index].value,
        });

        options.legend.data.push(JBXXQYNL[index].name);
      }

      //各地区知识产权数量及占比对比 柱图+堆叠-------------------------------------------------------------------------
    } else if (flag == "27") {
      //2017年-（T-1）年各地区知识产权增速 多折线图-------------------------------------------------------------------------
      options = {
        title: [
          {
            text: "标题1111111",
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#373c97",
          },
          top: 20,
          formatter: function (name) {
            return name.replace(/( 柱图| 折线图 )/g, "       ");
          },
          tooltip: {
            show: true,
          },
          data: [],
        },
        xAxis: [
          {
            type: "category",
            data: ["2016", "2017", "2018", "2019", "2020", "2021", "2022"],
          },
        ],
        yAxis: [
          {
            type: "value",
            axisLabel: {
              formatter: "{value}%",
            },
          },
        ],
        series: [],
      };

      var seriesDatas = [
        {
          name: "城市1",
          dataLine: [5, 42, 15, 42, 10, 42, 12, 42],
        },
        {
          name: "城市2",
          dataLine: [5, 12, 42, 10, 42, 20, 42, 18],
        },
        {
          name: "城市3",
          dataLine: [12, 42, 10, 42, 20, 42, 18, 42],
        },
        // 添加更多城市的数据...
      ];
      var colorLine = ["#3c66e3", "#90d67e", "#d6d5d5", "#ffce55", "#5257a5"];
      var lineLegendData = [];
      var barLegendData = [];
      for (var i = 0; i < seriesDatas.length; i++) {
        // 折线图系列
        options.series.push({
          name: seriesDatas[i].name + "地区",
          type: "line",
          color: colorLine[i],
          data: seriesDatas[i].dataLine,

          showSymbol: true,
          symbol:
            "image://data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMSIgdmlld0JveD0iMCAwIDEwIDEiIHZpZXdCb3g9IjAgMCAxMCAxIj4KICA8cGF0aCBkPSJNMCAwaDEwVjFIMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJub25lIi8+Cjwvc3ZnPgo=",
          symbolSize: [50, 50],
          yAxisIndex: 0,
        });
        lineLegendData.push(seriesDatas[i].name + "地区");
      }
      options.legend.data = barLegendData.concat([""], lineLegendData);

      //2017年-（T-1）年各地区知识产权增速 多折线图-------------------------------------------------------------------------
    } else if (flag == "28") {
      //2017-（T-1）年各地区的专利许可率对比 多折线图-------------------------------------------------------------------------
      options = {
        title: [
          {
            text: "标题1111111",
            left: "center",
            textStyle: { color: "#373c97" },
          },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,

          textStyle: {
            color: "#595959",
          },
          bottom: 0,
          formatter: function (name) {
            return name.replace(/( 柱图| 折线图 )/g, "       ");
          },
          tooltip: {
            show: true,
          },
          data: [],
        },
        xAxis: [
          {
            type: "category",
            data: ["2016", "2017", "2018", "2019", "2020", "2021", "2022"],
          },
        ],
        yAxis: [
          {
            type: "value",
            axisLabel: {
              formatter: "{value}%",
            },
          },
          {
            type: "value",
            axisLabel: {
              formatter: "{value}%",
            },
          },
        ],
        series: [],
      };

      var seriesDatas = [
        {
          name: "城市1",
          dataLine: [5, 42, 15, 42, 10, 42, 12, 42],
        },
        {
          name: "城市2",
          dataLine: [5, 12, 42, 10, 42, 20, 42, 18],
        },
        {
          name: "城市3",
          dataLine: [12, 42, 10, 42, 20, 42, 18, 42],
        },
        // 添加更多城市的数据...
      ];
      var colorLine = ["#3c66e3", "#90d67e", "#d6d5d5", "#ffce55", "#5257a5"];
      var lineLegendData = [];
      var barLegendData = [];
      for (var i = 0; i < seriesDatas.length; i++) {
        // 折线图系列
        options.series.push({
          name: seriesDatas[i].name + "地区",
          type: "line",
          color: colorLine[i],
          data: seriesDatas[i].dataLine,

          showSymbol: true,
          symbol:
            "image://data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMSIgdmlld0JveD0iMCAwIDEwIDEiIHZpZXdCb3g9IjAgMCAxMCAxIj4KICA8cGF0aCBkPSJNMCAwaDEwVjFIMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJub25lIi8+Cjwvc3ZnPgo=",
          symbolSize: [50, 50],
          yAxisIndex: 0,
        });
        lineLegendData.push(seriesDatas[i].name + "地区");
      }
      options.legend.data = barLegendData.concat([""], lineLegendData);

      //2017-（T-1）年各地区的专利许可率对比 多折线图-------------------------------------------------------------------------
    } else if (flag == "29") {
      //大数据产业资本来源区域 大饼图-------------------------------------------------------------------------
      colors = [
        "#373c97",
        "#ffc63a",
        "#d0cece",
        "#7ecf69",
        "#636363",
        "#264478",
        "#7cafdd",
      ];
      var datas = [
        {
          value: 3,
          name: "采纳",
        },
        {
          value: 3,
          name: "不采纳",
        },
        {
          value: 4,
          name: "其他",
        },
      ];
      for (var i = 0; i < datas.length; i++) {
        datas[i].itemStyle = {
          color: colors[i],
          borderColor: "#fff",
          borderWidth: 2,
        };
      }
      options = {
        legend: {
          // type: 'scroll',
          orient: "vertical",
          right: "20%",
          top: "30%",
          icon: "rect",
          itemWidth: 15,
          itemHeight: 15,
          itemGap: 20,
          textStyle: {
            color: "rgba(0, 0, 0, 0.65)",
            rich: {
              name: {
                fontSize: 15,
                padding: [36, 0, 0, 0],
              },
              value: {
                fontSize: 15,
                color: "rgba(0, 0, 0, 0.85)",
                padding: [20, 0, 0, 0],
                fontWeight: 700,
              },
            },
          },
        },
        series: [
          {
            type: "pie",
            radius: ["0", "50%"],
            center: ["50%", "50%"],
            labelLine: {
              show: false,
            },
            label: {
              show: true,
              position: "inside",
              color: "#fff",
              formatter: function (param) {
                console.log(param);
                return param.name + "\n\n" + param.value;
              },
            },
            itemStyle: {
              color: colors[0],
              borderColor: "#fff",
              borderWidth: 20,
            },
            data: datas,
          },
          {
            type: "pie",
            tooltip: {
              show: false,
            },
            clockWise: false, //顺时加载
            hoverAnimation: false, //鼠标移入变大
            center: ["50%", "50%"], //这里跟上面那组一样即可
            radius: ["50%", "50%"], //这里根据自己的需要自行调整，但是两个值要一样大哦，如果小于上方设置的最小内圆30%则为内阴影，大于外圆60%则为外阴影
            label: {
              normal: {
                show: false, //重点：此处主要是为了不展示data中的value和name
              },
            },
            data: [
              {
                value: 1, //此处的值无所谓是多少
                name: "", //因为不展示label，可不填
                itemStyle: {
                  //边框样式，此处我们设置的浅蓝色，颜色可自行修改
                  normal: {
                    borderWidth: 8, //边框宽度
                    borderColor: "rgba(94, 183, 249,  0.13)", //边框颜色
                  },
                },
              },
            ],
          },
        ],
      };

      //大数据产业资本来源区域 大饼图-------------------------------------------------------------------------
    } else if (flag == "30") {
      //各地区大数据产业获得投资金额 柱图+堆叠-------------------------------------------------------------------------
      var JBXXQYNL = JSON.parse(
        '{"JBXXQYNL":[{"name":"11","value":[15,30,40,12,77]},{"name":"22","value":[22,23,25,66,23]},{"name":"33","value":[15,20,30,60,70]}]}'
      ).JBXXQYNL;
      options = {
        color: ["#fac858", "#383b96", "#d0cece", "#D5B829", "#DB611A"],
        title: [
          { text: "123123", left: "center", textStyle: { color: "#373c97" } },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#595959",
          },
          bottom: 0,
          data: [],
        },
        grid: {
          left: "4%",
          right: "4%",
          bottom: "3%",
          top: "12%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          axisLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
          axisTick: {
            show: false,
          },

          axisLabel: {
            show: true, //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            margin: 15,
            textStyle: {
              color: "#595959",
              fontStyle: "normal",
              fontSize: 12,
            },
          },
          data: ["1年内", "1-3年", "3-5年", "5-10年", "10年以上"],
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
              textStyle: {
                color: "#333333",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
            },
            name: "获得投资金额（万元）",
            nameGap: 50, // y轴name与横纵坐标轴线的间距
            nameLocation: "middle", // y轴name处于y轴的什么位置
            nameTextStyle: {
              fontSize: 14,
              color: "#333333",
              fontWeight: 700,
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』

              textStyle: {
                color: "#333333",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param + "%";
              },
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              show: false,
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
        ],
        series: [],
      };

      for (var index = 0; index < JBXXQYNL.length; index++) {
        options.series.push({
          name: JBXXQYNL[index].name,
          type: "bar",
          stack: "总量",
          label: {
            show: true,
            position: "insideTop",
          },
          barWidth: "30%",
          data: JBXXQYNL[index].value,
        });

        options.legend.data.push(JBXXQYNL[index].name);
      }

      //各地区大数据产业获得投资金额 柱图+堆叠-------------------------------------------------------------------------
    } else if (flag == "31") {
      //大数据产业资本获投区域 大饼图-------------------------------------------------------------------------
      colors = [
        "#373c97",
        "#ffc63a",
        "#d0cece",
        "#7ecf69",
        "#636363",
        "#264478",
        "#7cafdd",
      ];
      var datas = [
        {
          value: 3,
          name: "采纳",
        },
        {
          value: 3,
          name: "不采纳",
        },
        {
          value: 4,
          name: "其他",
        },
      ];
      for (var i = 0; i < datas.length; i++) {
        datas[i].itemStyle = {
          color: colors[i],
          borderColor: "#fff",
          borderWidth: 2,
        };
      }
      options = {
        legend: {
          // type: 'scroll',
          orient: "vertical",
          right: "20%",
          top: "30%",
          icon: "rect",
          itemWidth: 15,
          itemHeight: 15,
          itemGap: 20,
          textStyle: {
            color: "rgba(0, 0, 0, 0.65)",
            rich: {
              name: {
                fontSize: 15,
                padding: [36, 0, 0, 0],
              },
              value: {
                fontSize: 15,
                color: "rgba(0, 0, 0, 0.85)",
                padding: [20, 0, 0, 0],
                fontWeight: 700,
              },
            },
          },
        },
        series: [
          {
            type: "pie",
            radius: ["0", "50%"],
            center: ["50%", "50%"],
            labelLine: {
              show: false,
            },
            label: {
              show: true,
              position: "inside",
              color: "#fff",
              formatter: function (param) {
                console.log(param);
                return param.name + "\n\n" + param.value;
              },
            },
            itemStyle: {
              color: colors[0],
              borderColor: "#fff",
              borderWidth: 20,
            },
            data: datas,
          },
          {
            type: "pie",
            tooltip: {
              show: false,
            },
            clockWise: false, //顺时加载
            hoverAnimation: false, //鼠标移入变大
            center: ["50%", "50%"], //这里跟上面那组一样即可
            radius: ["50%", "50%"], //这里根据自己的需要自行调整，但是两个值要一样大哦，如果小于上方设置的最小内圆30%则为内阴影，大于外圆60%则为外阴影
            label: {
              normal: {
                show: false, //重点：此处主要是为了不展示data中的value和name
              },
            },
            data: [
              {
                value: 1, //此处的值无所谓是多少
                name: "", //因为不展示label，可不填
                itemStyle: {
                  //边框样式，此处我们设置的浅蓝色，颜色可自行修改
                  normal: {
                    borderWidth: 8, //边框宽度
                    borderColor: "rgba(94, 183, 249,  0.13)", //边框颜色
                  },
                },
              },
            ],
          },
        ],
      };

      //大数据产业资本获投区域 大饼图-------------------------------------------------------------------------
    } else if (flag == "32") {
      //各地区大数据产业对外投资金额 柱图+堆叠-------------------------------------------------------------------------
      var JBXXQYNL = JSON.parse(
        '{"JBXXQYNL":[{"name":"11","value":[15,30,40,12,77]},{"name":"22","value":[22,23,25,66,23]},{"name":"33","value":[15,20,30,60,70]}]}'
      ).JBXXQYNL;
      options = {
        color: ["#fac858", "#383b96", "#d0cece", "#D5B829", "#DB611A"],
        title: [
          { text: "123123", left: "center", textStyle: { color: "#373c97" } },
        ],
        legend: {
          itemGap: 15,
          itemWidth: 20,
          itemHeight: 10,
          textStyle: {
            color: "#595959",
          },
          bottom: 0,
          data: [],
        },
        grid: {
          left: "4%",
          right: "4%",
          bottom: "3%",
          top: "12%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          axisLine: {
            lineStyle: {
              color: "#f2f2f2",
            },
          },
          axisTick: {
            show: false,
          },

          axisLabel: {
            show: true, //坐标轴刻度标签的相关设置。
            interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
            margin: 15,
            textStyle: {
              color: "#595959",
              fontStyle: "normal",
              fontSize: 12,
            },
          },
          data: ["1年内", "1-3年", "3-5年", "5-10年", "10年以上"],
        },
        yAxis: [
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』
              textStyle: {
                color: "#333333",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
            },
            name: "对外投资金额（万元）",
            nameGap: 50, // y轴name与横纵坐标轴线的间距
            nameLocation: "middle", // y轴name处于y轴的什么位置
            nameTextStyle: {
              fontSize: 14,
              color: "#333333",
              fontWeight: 700,
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
          {
            type: "value",
            axisLabel: {
              //坐标轴刻度标签的相关设置。
              interval: 0, //设置为 1，表示『隔一个标签显示一个标签』

              textStyle: {
                color: "#333333",
                fontStyle: "normal",
                fontFamily: "微软雅黑",
                fontSize: 12,
              },
              formatter: function (param) {
                return param + "%";
              },
            },
            axisTick: {
              show: false,
            },
            axisLine: {
              show: false,
              lineStyle: {
                color: "#273860",
              },
            },
            splitLine: {
              show: false,
              lineStyle: {
                color: "#f2f2f2",
              },
            },
          },
        ],
        series: [],
      };

      for (var index = 0; index < JBXXQYNL.length; index++) {
        options.series.push({
          name: JBXXQYNL[index].name,
          type: "bar",
          stack: "总量",
          label: {
            show: true,
            position: "insideTop",
          },
          barWidth: "30%",
          data: JBXXQYNL[index].value,
        });

        options.legend.data.push(JBXXQYNL[index].name);
      }

      //各地区大数据产业对外投资金额 柱图+堆叠-------------------------------------------------------------------------
    } else {
      options = {};
    }

    // }
    // 取消动画,否则生成图片过快，会出现无数据
    if (options !== undefined) {
      options.animation = false;
    }
    options.textStyle = { fontFamily: "Microsoft YaHei,msyh,msyhl", textEncoding: "UTF-8" };
    // body背景设置为白色
    $(document.body).css("backgroundColor", "white");
    // echarts容器
    var container = $("<div>")
      .attr("id", "container")
      .css({
        width: params.width,
        height: params.height,
      })
      .appendTo(document.body);

    var eChart = echarts.init(container[0]);
    eChart.setOption(options);
  }

  /**
   * debug,将对象转成json对象
   * @param obj
   */
  Convert.prototype.debug = function (obj) {
    console.log(JSON.stringify(obj, null, 4));
  };

  /**
   * 错误信息打印并退出
   * @param str 错误信息
   */
  Convert.prototype.error = function (str) {
    console.error("Error:" + str);
    this.exit();
  };

  /**
   * 退出，参数为空或是server时，不退出
   * @param params 参数
   */
  Convert.prototype.exit = function (params) {
    if (undefined === params || undefined === params.server) {
      phantom.exit();
    }
  };

  // 构建,入口
  new Convert(commandParams).init();
})(this, this.document);
