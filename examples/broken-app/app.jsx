import React from 'react';

function App() {
  return (
    <div>
      <h1>Broken App</h1>
      <button onClick={handleClick}>Click Me</button>
      <button onClick={submitForm}>Submit</button>
      <p>{formatMessage()}</p>
    </div>
  );
}

export default App;
