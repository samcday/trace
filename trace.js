var tracing = require("tracing");
var chain = require('stack-chain');

// Contains the call site objects of all the prevouse ticks leading
// up to this one
var callSitesForPreviuseTicks = null,
  mark = false;

exports.mark = function(id) {
  mark = id;
};

// add currentTrace to the callSite array
chain.extend.attach(function (error, frames) {
  frames = frames.slice(0);
  frames.push.apply(frames, callSitesForPreviuseTicks);
  return frames;
});

chain.format.replace(function(error, frames) {
  var lines = [];

  lines.push(error.toString());

  var currEvent = undefined;
  for (var i = 0; i < frames.length; i++) {
    if (frames[i].$$PREVEVENT$$ != currEvent) {
      lines.push("Previous event:");
      currEvent = frames[i].$$PREVEVENT$$;
    }
    lines.push("    at " + frames[i].toString());
  }

  return lines.join("\n");
});

// Setup an async listener with the handlers listed below
tracing.addAsyncListener({
  'create': asyncFunctionInitialized,
  'before': asyncCallbackBefore,
  'error': asyncCallbackError,
  'after': asyncCallbackAfter
});

function MarkerFrame(id) {
  this.id = id;
  this.isMarker = true;
}

MarkerFrame.prototype.toString = function() {
  return "--" + this.id + "--";
};

MarkerFrame.prototype.getFunctionName = function() {
  return "";
};

function asyncFunctionInitialized() {
  // Capture the callSites for this tick
  var err = new Error();
  // .slice(2) removes first this file and then process.runAsyncQueue from the
  // callSites array. Both of those only exists because of this module.
  var trace = err.callSite.slice(2);

  if (mark) {
    var fakeFrame = new MarkerFrame(mark);
    mark = false;
    callSitesForPreviuseTicks && callSitesForPreviuseTicks.unshift(fakeFrame);
  }

  trace.__num = (callSitesForPreviuseTicks ? callSitesForPreviuseTicks.__num + 1 : 0);
  trace.forEach(function(callSite) {
    callSite.$$PREVEVENT$$ = trace.__num;
  });

  // Add all the callSites from previuse ticks
  trace.push.apply(trace, callSitesForPreviuseTicks);

  // `trace` now contains callSites from this ticks and all the ticks leading
  // up to this event in time
  return trace;
}

function asyncCallbackBefore(context, trace) {
  // restore previuseTicks for this specific async action, thereby allowing it
  // to become a part of a error `stack` string
  callSitesForPreviuseTicks = trace;
}

function asyncCallbackError(trace, error) {
  // Ensure that the error `stack` string is constructed before the
  // previuseTicks is cleared.
  // The construction logic is defined in
  //  - https://github.com/v8/v8/blob/master/src/messages.js -> captureStackTrace
  // and in the stack-chain module invoked earlier in this file
  error.stack;

  // clear previuseTicks
  callSitesForPreviuseTicks = null;
}

function asyncCallbackAfter(context, trace) {
  // clear previuseTicks. This allows for other async actions to get there
  // very own trace stack and helps in preventing a trace stack to get attach
  // to an error `stack` string, in the unknown case where asyncCallbackBefore
  // wasn't invoked. (This is an unseen event since trace v1.0.0)
  callSitesForPreviuseTicks = null;
}
