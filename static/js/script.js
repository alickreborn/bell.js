(function(){
  var context = cubism.context()
  .serverDelay(0)
  .clientDelay(0)
  .step(1e4)  // 10sec
  .size(1080) // 4h
  ;

  var pattern, sort, limit, type, api;

  this.initBell = function(p, s, l, t, a) {
    pattern = p;
    sort = s;
    limit = l;
    type = t;
    api = a;

    plot();

    setInterval(function(){
      d3.select('#chart').selectAll('*').remove();
      plot();
    }, 10 * 60 * 1000);  // replot every 10 min
  };

  /*
   * 'GET' request an url, and call callback with JSON data
   */
  function request(url, callback) {
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open('GET', url, true);
    xmlhttp.send();
    xmlhttp.onreadystatechange = function() {
      if (xmlhttp.readyState === 4 && xmlhttp.status === 200) {
        var data = JSON.parse(xmlhttp.responseText);
        callback(data);
      }
    };
  }


  /*
   * Metrcs source
   */
  function makeMetric(name) {
    return context.metric(function(start, stop, step, callback){
      // cast to timestamp from date
      start = +start / 1000;
      stop = +stop / 1000;
      step = +step / 1000;

      // api url to fetch metrics
      var url = [api, 'metrics', name, start, stop, type].join('/');
      var values = [], i = 0;

      // request data and call callback with values
      request(url, function(data) {
        while (start < stop) {
          while (start < data.times[i]) {
            start += step;
            values.push(0);  // push 0 if no data at this timestamp
          }
          values.push(data.vals[i++]);
          start += step;
        }
        callback(null, values);
      });
    }, name);
  }


  /*
   * make a horizon chart
   */
  function horizon() {
    var hrz = context.horizon();

    if (type === 'm') {
      return hrz.extent([0, 2])
      .colors(['black', 'black', 'teal', '#dd1144']);
    } else if (type === 'v') {
      return hrz;
    }
  }


  /*
   * plot
   */
  function plot () {
    var url = [api, 'names', pattern, limit, sort].join('/');

    request(url, function(names){
      var data = [];
      for (var i = 0; i < names.length; i++) {
        data.push(makeMetric(names[i]));
      }

      d3.select('#chart').call(function(div) {
        div.append('div')
        .attr('class', 'axis')
        .call(context.axis().orient('top'));

        div.selectAll('.horizon')
        .data(data)
        .enter().append('div')
        .attr('class', 'horizon')
        .call(horizon());

        div.append('div')
        .attr('class', 'rule')
        .call(context.rule());
      });

      d3.selectAll('.title')
      .html(function(d){
        var name = d.toString();
        var params = {
          sort: sort,
          limit: 1,
          type: type
        };
        var url = root + name + '?' + buildUrlParams(params);
        return '<a href="' + url + '">' + name + '</a>';
      });
    });
  }

  /*
   * cubism context rule
   */
  context.on('focus', function(i){
    d3.selectAll('.value')
    .style('right', i === null ? null : context.size() - i + 'px');
  });

})(this);


function buildUrlParams(data) {
  var list = [];
  for (var key in data) {
    list.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key]));
  }
  return list.join('&');
}
