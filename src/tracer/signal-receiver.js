/**
 * TWOtails Signal Receiver
 * Sends signals from receiver endpoints
 */

class SignalReceiver {
  constructor() {
    this.signals = [];
  }

  sendFromFunctionDefinition(def) {
    const signal = {
      id: this.generateId(),
      type: 'function_definition',
      source: {
        file: def.file,
        line: def.line,
        name: def.name
      },
      payload: {
        functionName: def.name,
        params: def.params || []
      },
      timestamp: Date.now()
    };

    this.signals.push(signal);
    return signal;
  }

  sendFromEventListener(listener) {
    const signal = {
      id: this.generateId(),
      type: 'event_listener',
      source: {
        file: listener.file,
        line: listener.line,
        name: listener.name
      },
      payload: {
        eventName: listener.name,
        callback: listener.callback
      },
      timestamp: Date.now()
    };

    this.signals.push(signal);
    return signal;
  }

  sendFromRouteHandler(route) {
    const signal = {
      id: this.generateId(),
      type: 'route_handler',
      source: {
        file: route.file,
        line: route.line,
        name: route.path
      },
      payload: {
        method: route.method || 'GET',
        path: route.path,
        handler: route.handler
      },
      timestamp: Date.now()
    };

    this.signals.push(signal);
    return signal;
  }

  sendFromComponentMount(component) {
    const signal = {
      id: this.generateId(),
      type: 'component_mount',
      source: {
        file: component.file,
        line: component.line,
        name: component.name
      },
      payload: {
        componentName: component.name,
        props: component.props || {}
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

module.exports = { SignalReceiver };
