/**
 * TWOtails Signal Sender
 * Sends signals from sender endpoints
 */

class SignalSender {
  constructor() {
    this.signals = [];
  }

  sendFromFunctionCall(call) {
    const signal = {
      id: this.generateId(),
      type: 'function_call',
      source: {
        file: call.file,
        line: call.line,
        name: call.name
      },
      payload: {
        functionName: call.name,
        arguments: call.args || []
      },
      timestamp: Date.now()
    };

    this.signals.push(signal);
    return signal;
  }

  sendFromEventEmit(emit) {
    const signal = {
      id: this.generateId(),
      type: 'event_emit',
      source: {
        file: emit.file,
        line: emit.line,
        name: emit.name
      },
      payload: {
        eventName: emit.name,
        data: emit.data || {}
      },
      timestamp: Date.now()
    };

    this.signals.push(signal);
    return signal;
  }

  sendFromAPICall(api) {
    const signal = {
      id: this.generateId(),
      type: 'api_call',
      source: {
        file: api.file,
        line: api.line,
        name: api.endpoint
      },
      payload: {
        method: api.method || 'GET',
        endpoint: api.endpoint,
        body: api.body
      },
      timestamp: Date.now()
    };

    this.signals.push(signal);
    return signal;
  }

  sendFromButtonClick(button) {
    const signal = {
      id: this.generateId(),
      type: 'button_click',
      source: {
        file: button.file,
        line: button.line,
        name: button.handler
      },
      payload: {
        element: button.element,
        handler: button.handler
      },
      timestamp: Date.now()
    };

    this.signals.push(signal);
    return signal;
  }

  generateId() {
    return `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getSignals() {
    return this.signals;
  }

  clearSignals() {
    this.signals = [];
  }
}

module.exports = { SignalSender };
