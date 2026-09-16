import React from 'react';

function App() {
  const handleSubmit = (event) => {
    event.preventDefault();
    console.log('Form submitted');
  };

  return (
    <div>
      <h1>Working App</h1>
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}

export default App;
