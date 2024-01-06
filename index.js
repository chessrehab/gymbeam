//Martin Svec
//the algorithm I used for searching the shortest route might not be theoretically the most optimal. For really the most optimal, I would have to research for a known mathematical solution to the problem of shotest routes.
//I put the code in one file to make it simple. Normally i would split it into more files (1 for app, 1 for router, 1 for supporting functions)
//I didnt use TypeScript, but technically -JavaScript is a subset of TypeScript so it might be considered as TypeScrip :)

//using the express framework to save time with setting up routing of the endpoint, hope its ok :)
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const router = new express.Router();
const port = 3000;

const URL_PREFIX = "https://dev.aux.boxpi.com/case-study/products/";
const URL_SUFFIX = "/positions";
const API_KEY = "MVGBMS0VQI555bTery9qJ91BfUpi53N24SkKMf9Z";

app.use(express.json());

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(router);

//setup the server endpoint for POST method and the name "warehouse"
router.post("/warehouse", async (req, res) => {
  try {
    //check the body of the request, if it exists
    const input = req.body;

    if (
      //check if the input has all data required
      input &&
      input.products &&
      input.products.length > 0 &&
      input.startingPosition
    ) {
      let output;

      try {
        output = await createOutput(input);
      } catch (e) {
        //serverside issue
        res.status(500).send(e.msg);
      }
      //everything is ok, the output was generated and can be sent back to client
      res.set("Content-Type", "application/json");
      res.status(200).send(JSON.stringify(output));
    } else {
      //client input is NOT ok, doesnt contain needed data
      throw new Error();
    }
  } catch (e) {
    //clientside issue
    res
      .status(400)
      .send("You didn't specify the input or the input is incorrect");
  }
});
//start the server listening on chosen port
app.listen(port, () => {
  console.log("Server is up on port " + port);
});

//supporting functions //////////////////////////////////////////////////////////////////////////////////////////////

const createOutput = async (input) => {
  const allProducts = [];
  const allFetches = [];
  input.products.forEach((prod) => {
    //create an array of promises fetching positions for all products
    allFetches.push(fetching(prod));
  });

  //wait for all fetches to finish
  const fetched = await Promise.all(allFetches);
  //create an array with all positions for all products
  fetched.forEach((response) => {
    allProducts.push({
      product: response[0].productId,
      positions: response,
    });
  });

  //fetching is done with no errors, we created allProducts array and now we send it to calculate the fastest route and provide output data
  return calculateRoute(allProducts, input.startingPosition);
};

//function to fetch the warehouse data with product positions
const fetching = async (productId) => {
  //fetch positions for product
  const whDataResponse = await fetch(URL_PREFIX + productId + URL_SUFFIX, {
    method: "GET",
    headers: {
      "x-api-key": API_KEY,
    },
  });

  //check if response is ok
  if (whDataResponse.ok) {
    const whPositions = await whDataResponse.json();

    //check if the product exists and have positions in the warehouse
    if (whPositions && whPositions.length > 0) {
      //check if we have at least one product available on the positions
      const totalProductQuantity = whPositions.reduce(
        (total, position) => total + position.quantity,
        0
      );
      if (totalProductQuantity > 0) {
        //not all positions of the product have 0 quantities, we can return the fetched data
        return whPositions;
      } else {
        //all positions for the product are empty (quantities=0)
        throw {
          msg: `Warehouse server failure -Product ${productId} out of stock`,
        };
      }
    } else {
      // fetched an empty array of positions or null
      throw {
        msg: `Warehouse server failure -There are no positions in the warehouse for  ${productId}`,
      };
    }
  } else {
    //failed response from WH API
    throw { msg: "Warehouse server connection failure -Server not responding" };
  }
};

//function to find the shortest route. It will always look for the closest positions of products we dont have yet in the cart.
const calculateRoute = (products, startingPosition) => {
  let output = {
    pickingOrder: [],
    distance: 0,
  };

  let allPositions = [];

  //create a single array with all positions for all chosen products
  products.forEach((prod) => {
    allPositions.push(...prod.positions);
  });

  //filter out all positions with quantity=0
  allPositions = allPositions.filter((position) => position.quantity > 0);

  let productsPicked = 0;

  //we put ourself in the starting position
  let currentPosition = startingPosition;

  //this cycle will run 1 time for each product and will fill the cart.
  while (productsPicked < products.length) {
    const positionsWithDistance = allPositions.map((position) => {
      //add distance attribute to positions objects (distance from current position of the cart)
      position.distance = calculateDistance(currentPosition, {
        x: position.x,
        y: position.y,
        z: position.z,
      });
      return position;
    });

    //sort positions by distance from closest to the furtherest
    const positionsWithDistanceSorted = positionsWithDistance.sort(
      (pos1, pos2) => pos1.distance - pos2.distance
    );

    //we will pick the product with closest distance, thats first in the aorted array
    const pickedProduct = positionsWithDistanceSorted[0];
    productsPicked++;

    //we add the picked product into our output object
    output.pickingOrder.push({
      productId: pickedProduct.productId,
      positionId: pickedProduct.positionId,
    });

    //we increase the distance by the distance we traveled in the output object
    output.distance += pickedProduct.distance;

    //we move to the position where we picked the product
    currentPosition = {
      x: pickedProduct.x,
      y: pickedProduct.y,
      z: pickedProduct.z,
    };

    //we get a rid of all the remaining positions of the product we just picked
    allPositions = allPositions.filter(
      (position) => position.productId !== pickedProduct.productId
    );
  }

  //we have found all products and have the output object ready
  return output;
};

//function to calculate the distance between 2 positions. I assume the cart can move in perpendicular fashion and  it cannot fly diagonally. IRL I would ask if i understand it correct.
const calculateDistance = (position1, position2) => {
  const distance =
    Math.abs(position1.x - position2.x) +
    Math.abs(position1.y - position2.y) +
    Math.abs(position1.z - position2.z);
  return distance;
};
