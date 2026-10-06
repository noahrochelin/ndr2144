// ===== 1. SETTINGS =====

const width = 950;
const height = 400;
const margin = { top: 30, right: 160, bottom: 55, left: 30 };

// one color per continent, in the same order as the original legend
const colors = {
  "North America": "#E56E5A",
  "South America": "#883039",
  "Africa": "#A2559C",
  "Europe": "#4C6A9C",
  "Asia": "#00847E",
  "Oceania": "#9A5129"
};

// color for countries that are NOT selected
const gray = "#d6d6d6";

// the countries the user has selected (a Set = a list without duplicates)
const selected = new Set();

// the country shown in the side panel, and the year on screen
let panelCountry = null;
let currentYear = 2025;


// ===== 2. SVG, SCALES, AXES =====

const svg = d3.select("#chart")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// invisible background: clicking empty space clears the selection
const background = svg.append("rect")
  .attr("width", width - margin.right)
  .attr("height", height)
  .attr("fill", "transparent");

const xScale = d3.scaleLog()
  .domain([700, 150000])
  .range([margin.left, width - margin.right]);

const yScale = d3.scaleLinear()
  .domain([1.3, 7.9])
  .range([height - margin.bottom, margin.top]);

const xAxis = d3.axisBottom(xScale)
  .tickValues([2000, 5000, 10000, 20000, 50000, 100000])
  .tickFormat(function(d) { return "$" + d3.format(",")(d); })
  .tickSize(-(height - margin.top - margin.bottom))
  .tickPadding(10);

const yAxis = d3.axisLeft(yScale)
  .tickValues([2, 3, 4, 5, 6, 7])
  .tickFormat(d3.format("d"))
  .tickSize(-(width - margin.left - margin.right))
  .tickPadding(8);

svg.append("g")
  .attr("class", "axis")
  .attr("transform", "translate(0, " + (height - margin.bottom) + ")")
  .call(xAxis);

svg.append("g")
  .attr("class", "axis")
  .attr("transform", "translate(" + margin.left + ", 0)")
  .call(yAxis);

// axis titles: first part bold, second part normal (tspan = a piece of text)
const yTitle = svg.append("text")
  .attr("class", "axis-title")
  .attr("x", 0)
  .attr("y", 12);
yTitle.append("tspan").attr("font-weight", 700).text("Life satisfaction");
yTitle.append("tspan").text(" (0–10)");

const xTitle = svg.append("text")
  .attr("class", "axis-title")
  .attr("x", (margin.left + width - margin.right) / 2)
  .attr("y", height - 8)
  .attr("text-anchor", "middle");
xTitle.append("tspan").attr("font-weight", 700).text("GDP per capita");
xTitle.append("tspan").text(" (international-$ in 2021 prices; plotted on a logarithmic axis)");


// ===== 3. LEGEND (small squares, top right) =====

const legendItems = svg.append("g")
  .attr("class", "legend")
  .attr("transform", "translate(" + (width - margin.right + 20) + ", " + margin.top + ")")
  .selectAll("g")
  .data(Object.keys(colors))
  .join("g")
  .attr("class", "legend-item")
  .attr("transform", function(d, i) { return "translate(0, " + (i * 21) + ")"; });

legendItems.append("rect")
  .attr("width", 10)
  .attr("height", 10)
  .attr("fill", function(d) { return colors[d]; });

legendItems.append("text")
  .attr("x", 16)
  .attr("y", 9)
  .text(function(d) { return d; });


// ===== 4. LAYERS (dots at the bottom, then rings, then labels on top) =====

const dotLayer = svg.append("g");
const ringLayer = svg.append("g");
const labelLayer = svg.append("g");

const tooltip = d3.select("#tooltip");


// ===== 5. LOAD AND PREPARE THE DATA =====

d3.csv("gdp-vs-happiness.csv").then(function(data) {

  data.forEach(function(d) {
    d.year = +d["Year"];
    d.satisfaction = d["Life satisfaction"] === "" ? null : +d["Life satisfaction"];
    d.gdp = d["GDP per capita"] === "" ? null : +d["GDP per capita"];
  });

  // the continent of each country
  const regionOf = {};
  data.forEach(function(d) {
    if (d["World region according to OWID"] !== "") {
      regionOf[d.Entity] = d["World region according to OWID"];
    }
  });

  // keep only real countries (no regions like "Africa")
  const rows = data.filter(function(d) {
    return d.Code !== ""
      && !d.Code.startsWith("OWID")
      && colors[regionOf[d.Entity]] !== undefined;
  });

  // group the rows by country: "Argentina" -> all of Argentina's rows
  const byCountry = d3.group(rows, function(d) { return d.Entity; });

  // one point per country for a given year
  function pointsFor(year) {
    const points = [];

    byCountry.forEach(function(countryRows, name) {

      // life satisfaction must exist in that year
      const satRow = countryRows.find(function(d) {
        return d.year === year && d.satisfaction !== null;
      });

      // GDP: that year, or the closest earlier year (up to 5 years back),
      // like the original does for 2025
      const gdpRows = countryRows.filter(function(d) {
        return d.gdp !== null && d.year <= year && d.year >= year - 5;
      });
      const gdpRow = d3.greatest(gdpRows, function(d) { return d.year; });

      if (satRow && gdpRow) {
        points.push({
          name: name,
          region: regionOf[name],
          year: year,
          satisfaction: satRow.satisfaction,
          gdp: gdpRow.gdp
        });
      }
    });

    return points;
  }


  // ===== 6. DRAW ONE YEAR =====

  function draw(year) {

    currentYear = year;
    d3.select("#title-year").text(year);
    updatePanel();

    const points = pointsFor(year);

    // no data this year (2013): keep the circles where they are
    if (points.length === 0) {
      d3.select("#title-year").text(year + " (no data)");
      return;
    }

    const somethingSelected = selected.size > 0;

    // the color of a dot: its continent color, or gray if it is not selected
    function dotColor(d) {
      if (!somethingSelected || selected.has(d.name)) {
        return colors[d.region];
      }
      return gray;
    }

    // --- the dots ---
    const dots = dotLayer.selectAll("circle")
      .data(points, function(d) { return d.name; })
      .join(
        function(enter) {
          return enter.append("circle")
            .attr("cx", function(d) { return xScale(d.gdp); })
            .attr("cy", function(d) { return yScale(d.satisfaction); })
            .attr("fill", dotColor)
            .attr("opacity", 0);
        },
        function(update) {
          return update;
        },
        function(exit) {
          return exit.transition().duration(800).attr("opacity", 0).remove();
        }
      )
      .attr("r", 4)
      .style("cursor", "pointer")
      .on("mouseover", function(event, d) {
        d3.select(this).attr("stroke", "#333").attr("stroke-width", 1.5);
        tooltip
          .style("opacity", 1)
          .html(
            "<div class='tt-head'><div class='tt-name'>" + d.name + "</div>" + d.year + "</div>" +
            "<div class='tt-row'><div class='tt-label'>GDP per capita (international-$ in 2021 prices)</div>" +
            "<div class='tt-value'>$" + d3.format(",.0f")(d.gdp) + "</div></div>" +
            "<div class='tt-row'><div class='tt-label'>Life satisfaction (0–10)</div>" +
            "<div class='tt-value'>" + d.satisfaction.toFixed(2) + "</div></div>"
          );
      })
      .on("mousemove", function(event) {
        tooltip
          .style("left", (event.pageX + 14) + "px")
          .style("top", (event.pageY + 14) + "px");
      })
      .on("mouseout", function() {
        d3.select(this).attr("stroke", null);
        tooltip.style("opacity", 0);
      })
      .on("click", function(event, d) {
        toggleCountry(d.name);
      });

    // MY IMPROVEMENT: glide to the new position (and fade in / change color)
    dots.transition()
      .duration(800)
      .attr("opacity", 1)
      .attr("fill", dotColor)
      .attr("cx", function(d) { return xScale(d.gdp); })
      .attr("cy", function(d) { return yScale(d.satisfaction); });

    // selected dots on top of the gray ones
    dots.filter(function(d) { return selected.has(d.name); }).raise();

    // --- rings and name labels for selected countries (like the original) ---
    const selectedPoints = points.filter(function(d) { return selected.has(d.name); });

    ringLayer.selectAll("circle")
      .data(selectedPoints, function(d) { return d.name; })
      .join(function(enter) {
        return enter.append("circle")
          .attr("cx", function(d) { return xScale(d.gdp); })
          .attr("cy", function(d) { return yScale(d.satisfaction); });
      })
      .attr("r", 8)
      .attr("fill", "none")
      .attr("stroke", function(d) { return colors[d.region]; })
      .attr("stroke-width", 1.5)
      .style("pointer-events", "none")
      .transition()
      .duration(800)
      .attr("cx", function(d) { return xScale(d.gdp); })
      .attr("cy", function(d) { return yScale(d.satisfaction); });

    // --- country names: as many as fit without overlapping (like the original) ---
    const labels = chooseLabels(points);

    labelLayer.selectAll("text")
      .data(labels, function(l) { return l.name; })
      .join(
        function(enter) {
          return enter.append("text")
            .attr("x", function(l) { return l.x; })
            .attr("y", function(l) { return l.y; })
            .attr("opacity", 0);
        },
        function(update) {
          return update;
        },
        function(exit) {
          return exit.transition().duration(400).attr("opacity", 0).remove();
        }
      )
      .attr("class", "country-label")
      .attr("text-anchor", function(l) { return l.anchor; })
      .attr("fill", function(l) { return colors[l.region]; })
      .text(function(l) { return l.name; })
      .transition()
      .duration(800)
      .attr("opacity", 1)
      .attr("x", function(l) { return l.x; })
      .attr("y", function(l) { return l.y; });

    // --- legend: gray out continents with nothing selected ---
    legendItems.select("rect")
      .attr("fill", function(region) {
        if (!somethingSelected || continentHasSelection(region)) {
          return colors[region];
        }
        return "#e6e6e6";
      });
  }


  // ===== 6b. CHOOSE WHICH NAMES TO SHOW =====
  // We go through the countries one by one and keep a name only if it
  // does not overlap a name we already kept.

  function chooseLabels(points) {

    let candidates;

    if (selected.size > 0) {
      // something is selected: only name the selected countries
      candidates = points.filter(function(d) { return selected.has(d.name); });
    } else {
      // nothing selected: start with the most unusual countries
      // (the ones farthest from the average life satisfaction)
      const average = d3.mean(points, function(d) { return d.satisfaction; });
      candidates = points.slice().sort(function(a, b) {
        return Math.abs(b.satisfaction - average) - Math.abs(a.satisfaction - average);
      });
    }

    const kept = [];   // the labels we will draw
    const boxes = [];  // the rectangles they occupy

    candidates.forEach(function(d) {
      const cx = xScale(d.gdp);
      const cy = yScale(d.satisfaction);
      const textWidth = d.name.length * 6.5;   // rough width of the text in pixels

      // try the right side of the dot; if it does not fit, the left side
      let anchor = "start";
      let x = cx + 6;
      let box = { left: x, right: x + textWidth };
      if (box.right > width - margin.right) {
        anchor = "end";
        x = cx - 6;
        box = { left: x - textWidth, right: x };
      }
      box.top = cy - 9;
      box.bottom = cy + 5;

      // does this box overlap any box we already kept?
      const overlaps = boxes.some(function(b) {
        return box.left < b.right && box.right > b.left
            && box.top < b.bottom && box.bottom > b.top;
      });

      if (!overlaps) {
        boxes.push(box);
        kept.push({ name: d.name, region: d.region, x: x, y: cy + 4, anchor: anchor });
      }
    });

    return kept;
  }


  // ===== 7. SELECTING COUNTRIES (copied from the original) =====

  function countriesIn(region) {
    return Array.from(byCountry.keys()).filter(function(name) {
      return regionOf[name] === region;
    });
  }

  function continentHasSelection(region) {
    return countriesIn(region).some(function(name) { return selected.has(name); });
  }

  // click a dot: select it, or unselect it if it was already selected
  function toggleCountry(name) {
    if (selected.has(name)) {
      selected.delete(name);
      if (panelCountry === name) {
        panelCountry = null;
      }
    } else {
      selected.add(name);
      panelCountry = name;
    }
    draw(currentYear);
  }

  // click a continent in the legend: select (or unselect) all its countries
  legendItems.on("click", function(event, region) {
    const names = countriesIn(region);
    const allSelected = names.every(function(name) { return selected.has(name); });

    names.forEach(function(name) {
      if (allSelected) {
        selected.delete(name);
      } else {
        selected.add(name);
      }
    });
    draw(currentYear);
  });

  // click empty space: clear everything
  background.on("click", function() {
    selected.clear();
    panelCountry = null;
    draw(currentYear);
  });


  // ===== 8. MY SECOND ADDITION: SIDE PANEL WITH THE CLICKED COUNTRY'S NUMBERS =====

  function updatePanel() {

    if (panelCountry === null) {
      d3.select("#country-panel").html("");
      return;
    }

    // all years where this country has both numbers
    const history = byCountry.get(panelCountry).filter(function(d) {
      return d.satisfaction !== null && d.gdp !== null;
    });
    const first = history[0];
    const last = history[history.length - 1];

    const now = pointsFor(currentYear).find(function(d) { return d.name === panelCountry; });

    let html = "<h3>" + panelCountry + "</h3>";
    html += "<p>" + regionOf[panelCountry] + "</p>";

    if (now) {
      html += "<p><b>" + currentYear + "</b><br>"
        + "Life satisfaction: " + now.satisfaction.toFixed(2) + "<br>"
        + "GDP per capita: $" + d3.format(",.0f")(now.gdp) + "</p>";
    } else {
      html += "<p><b>" + currentYear + "</b><br>No data this year</p>";
    }

    if (first && last) {
      const satChange = last.satisfaction - first.satisfaction;
      const gdpChange = (last.gdp / first.gdp - 1) * 100;

      html += "<p><b>Change " + first.year + "–" + last.year + "</b><br>"
        + "Life satisfaction: " + (satChange >= 0 ? "+" : "") + satChange.toFixed(2) + "<br>"
        + "GDP per capita: " + (gdpChange >= 0 ? "+" : "") + gdpChange.toFixed(0) + "%</p>";
    }

    d3.select("#country-panel").html(html);
  }


  // ===== 9. TIMELINE: SLIDER AND PLAY BUTTON =====

  const slider = d3.select("#year-slider");

  slider.on("input", function() {
    draw(+this.value);
  });

  function setYear(year) {
    slider.property("value", year);
    draw(year);
  }

  let timer = null;

  function stop() {
    clearInterval(timer);
    timer = null;
    d3.select("#play-button").text("▶");
  }

  d3.select("#play-button").on("click", function() {
    if (timer !== null) {
      stop();
      return;
    }

    d3.select(this).text("❚❚");

    // if we are at the end, start again from the beginning
    if (currentYear === 2025) {
      setYear(2011);
    }

    timer = setInterval(function() {
      if (currentYear >= 2025) {
        stop();
      } else {
        setYear(currentYear + 1);
      }
    }, 1000);
  });


  // start with the last year, like the original
  draw(2025);
});
