/**
 * Weather integration for Budget Game
 * Handles fetching and processing weather data from OpenWeather API
 */

// Store these in Properties Service for better security in a real application
const WEATHER_CONFIG = {
  API_KEY: "802fb97a7d02faf2af493f1fcc85eefe", // Replace with your actual API key
  DEFAULT_LOCATION: {
    city: "Minneapolis", // Default city
    lat: 44.98,     // Default latitude
    lon: -93.2638,    // Default longitude
    units: "imperial"  // Use "metric" for Celsius
  }
};

/**
 * Fetches current weather data from OpenWeather API
 * @param {object} location Optional location object {lat, lon, city, units}
 * @return {object} Weather data object or null on failure
 */
function fetchWeatherData(location = {}) {
  try {
    const loc = { ...WEATHER_CONFIG.DEFAULT_LOCATION, ...location };
    const useCoordinates = loc.lat !== undefined && loc.lon !== undefined;

    // Build the API URL
    let apiUrl;
    if (useCoordinates) {
      apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${loc.lat}&lon=${loc.lon}&units=${loc.units}&appid=${WEATHER_CONFIG.API_KEY}`;
    } else if (loc.city) {
      apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(loc.city)}&units=${loc.units}&appid=${WEATHER_CONFIG.API_KEY}`;
    } else {
      Logger.log("No valid location provided for weather data");
      return null;
    }

    // Make the API request
    const response = UrlFetchApp.fetch(apiUrl);
    const data = JSON.parse(response.getContentText());
    
    if (data.cod !== 200) {
      Logger.log(`Weather API error: ${data.message}`);
      return null;
    }
    
    return processWeatherData(data);
  } catch (error) {
    Logger.log(`Error fetching weather data: ${error}`);
    return null;
  }
}

/**
 * Processes raw weather data into a more usable format
 * @param {object} rawData The raw weather data from API
 * @return {object} Processed weather data
 */
function processWeatherData(rawData) {
  if (!rawData || !rawData.main) {
    return null;
  }
  
  // Create a simplified weather object with just the data we need
  const weather = {
    temp: Math.round(rawData.main.temp),
    feelsLike: Math.round(rawData.main.feels_like),
    tempMin: Math.round(rawData.main.temp_min),
    tempMax: Math.round(rawData.main.temp_max),
    humidity: rawData.main.humidity,
    description: rawData.weather[0]?.description || "Unknown",
    mainCondition: rawData.weather[0]?.main || "Unknown",
    icon: rawData.weather[0]?.icon || "01d",
    windSpeed: rawData.wind?.speed || 0,
    location: rawData.name,
    country: rawData.sys?.country,
    sunrise: rawData.sys?.sunrise ? new Date(rawData.sys.sunrise * 1000) : null,
    sunset: rawData.sys?.sunset ? new Date(rawData.sys.sunset * 1000) : null,
    forecast: getForecastSummary(rawData)
  };
  
  // Add additional helpful properties
  weather.isRaining = weather.mainCondition.toLowerCase().includes('rain');
  weather.isSnowing = weather.mainCondition.toLowerCase().includes('snow');
  weather.isClear = weather.mainCondition.toLowerCase().includes('clear');
  weather.isCloudy = weather.mainCondition.toLowerCase().includes('cloud');
  weather.isStormy = weather.mainCondition.toLowerCase().includes('thunderstorm');
  weather.isFoggy = weather.mainCondition.toLowerCase().includes('fog') || 
                    weather.mainCondition.toLowerCase().includes('mist');
  
  // Determine if it's comfortable, hot, or cold
  const units = WEATHER_CONFIG.DEFAULT_LOCATION.units;
  if (units === "imperial") {
    weather.isHot = weather.temp > 85;
    weather.isCold = weather.temp < 45;
    weather.isComfortable = !weather.isHot && !weather.isCold;
  } else {
    weather.isHot = weather.temp > 29;
    weather.isCold = weather.temp < 7;
    weather.isComfortable = !weather.isHot && !weather.isCold;
  }
  
  // Get icon URL
  weather.iconUrl = `https://openweathermap.org/img/wn/${weather.icon}@2x.png`;
  
  // Get time of day
  const now = new Date();
  weather.isDaytime = weather.sunrise && weather.sunset ? 
    (now > weather.sunrise && now < weather.sunset) : 
    (now.getHours() >= 6 && now.getHours() < 18);
  
  return weather;
}

/**
 * Generates a simple forecast summary based on current conditions
 * Note: For full forecast, you'd need to use the OneCall API
 * @param {object} weatherData The weather data object
 * @return {string} A simple forecast description
 */
function getForecastSummary(weatherData) {
  if (!weatherData || !weatherData.weather || !weatherData.weather[0]) {
    return "Forecast unavailable";
  }
  
  const condition = weatherData.weather[0].main.toLowerCase();
  const temp = Math.round(weatherData.main.temp);
  const units = WEATHER_CONFIG.DEFAULT_LOCATION.units === "imperial" ? "°F" : "°C";
  const windSpeed = weatherData.wind ? weatherData.wind.speed : 0;
  
  let summary = `Currently ${temp}${units} with ${weatherData.weather[0].description}`;
  
  // Add some context based on conditions
  if (condition.includes('rain')) {
    summary += `. Expect precipitation throughout the day.`;
  } else if (condition.includes('snow')) {
    summary += `. Bundle up and allow extra travel time.`;
  } else if (condition.includes('clear') && temp > (WEATHER_CONFIG.DEFAULT_LOCATION.units === "imperial" ? 75 : 24)) {
    summary += `. Great day to be outside!`;
  } else if (condition.includes('cloud')) {
    summary += `. Overcast conditions expected.`;
  } else if (condition.includes('thunderstorm')) {
    summary += `. Storm activity in the area - stay safe!`;
  } else {
    summary += `. Have a great day!`;
  }
  
  return summary;
}

/**
 * Gets a weather-appropriate emoji for display
 * @param {object} weatherData The processed weather data
 * @return {string} An emoji representing the current weather
 */
function getWeatherEmoji(weatherData) {
  if (!weatherData) return "🌤️";
  
  const condition = weatherData.mainCondition.toLowerCase();
  
  if (condition.includes('thunderstorm')) return "⛈️";
  if (condition.includes('drizzle')) return "🌦️";
  if (condition.includes('rain')) return "🌧️";
  if (condition.includes('snow')) return "❄️";
  if (condition.includes('fog') || condition.includes('mist')) return "🌫️";
  if (condition.includes('cloud')) {
    return weatherData.description.includes('broken') || 
           weatherData.description.includes('overcast') ? "☁️" : "🌥️";
  }
  if (condition.includes('clear')) {
    return weatherData.isDaytime ? "☀️" : "🌙";
  }
  
  return "🌤️"; // Default
}

/**
 * Generates a weather-specific message based on conditions
 * @param {object} weatherData The processed weather data
 * @return {string} A weather-appropriate message
 */
function getWeatherMessage(weatherData) {
  if (!weatherData) return "Weather data unavailable, but that won't stop you from having a great day!";
  
  const condition = weatherData.mainCondition.toLowerCase();
  const temp = weatherData.temp;
  const emoji = getWeatherEmoji(weatherData);
  const units = WEATHER_CONFIG.DEFAULT_LOCATION.units === "imperial" ? "°F" : "°C";
  
  let message = `${emoji} Currently ${temp}${units} and ${weatherData.description} in ${weatherData.location}. `;
  
  // Add condition-specific advice
  if (weatherData.isRaining) {
    message += "Don't forget an umbrella today! A little rain can't dampen your goals.";
  } else if (weatherData.isSnowing) {
    message += "Bundle up and stay warm! Perfect day for cozy indoor productivity.";
  } else if (weatherData.isHot) {
    message += "Stay hydrated and cool today. Great weather for an early morning or evening walk!";
  } else if (weatherData.isCold) {
    message += "Dress warmly and maybe treat yourself to a hot drink. Perfect weather for focusing indoors!";
  } else if (weatherData.isClear && weatherData.isDaytime) {
    message += "Beautiful clear skies today! Consider taking a short walk or enjoying some outdoor time.";
  } else if (weatherData.isCloudy) {
    message += "Overcast but perfect for focused work. Make today count regardless of the clouds!";
  } else {
    message += weatherData.forecast;
  }
  
  return message;
}

/**
 * Returns weather-influenced suggestions based on current conditions
 * @param {object} weatherData The processed weather data
 * @return {Array<object>} Array of weather-appropriate suggestions
 */
function getWeatherSuggestions(weatherData) {
  if (!weatherData) return [];
  
  const suggestions = [];
  
  // Indoor suggestions for bad weather
  if (weatherData.isRaining || weatherData.isSnowing || weatherData.isStormy) {
    suggestions.push({
      text: "Perfect day to tackle that indoor decluttering project you've been postponing.",
      activity: "Declutter one area",
      type: "household"
    });
    
    suggestions.push({
      text: "Stay dry and save money by cooking a homemade meal instead of ordering delivery.",
      activity: "Home made dinner",
      type: "financial"
    });
  }
  
  // Outdoor suggestions for nice weather
  if (weatherData.isClear && !weatherData.isHot && !weatherData.isCold) {
    suggestions.push({
      text: "Beautiful weather today! Consider a walk outside instead of a coffee run.",
      activity: "Take a stretch break during work",
      type: "health"
    });
    
    suggestions.push({
      text: "Weather's perfect for hanging laundry outside to dry instead of using the dryer.",
      activity: "Laundry folded and put away",
      type: "household"
    });
  }
  
  // Hot weather suggestions
  if (weatherData.isHot) {
    suggestions.push({
      text: "Beat the heat by preparing a refreshing cold meal rather than ordering out.",
      activity: "Home made dinner",
      type: "financial"
    });
    
    suggestions.push({
      text: "Stay hydrated throughout the day with water instead of purchasing cold drinks outside.",
      activity: "Drink water instead of sugary drinks all day",
      type: "health"
    });
  }
  
  // Cold weather suggestions
  if (weatherData.isCold) {
    suggestions.push({
      text: "Chilly day! Make a thermos of coffee/tea at home rather than stopping for a hot drink.",
      activity: "Pack lunch for work/school",
      type: "financial"
    });
    
    suggestions.push({
      text: "Stay warm and cozy at home with a simple slow cooker meal instead of ordering delivery.",
      activity: "Home made dinner",
      type: "financial"
    });
  }
  
  return suggestions;
}
