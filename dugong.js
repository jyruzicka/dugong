var Dugong = {};

//Constants
Dugong.stalkLength = 	200; //Distance between nodes
Dugong.boxMinHeight =  50;
Dugong.boxRatio = 			2; //Width-to-height ratio of nodes.
Dugong.canvasMargin =	100; //Margin around outside of map
Dugong.boxMargin =      10; //Margin inside each box

//Makes an SVG element
Dugong.e = function(elem, opts) {
	var e = document.createElementNS("http://www.w3.org/2000/svg", elem);
	if (opts) {
		var keys = Object.keys(opts);
		for (var i=0;i<keys.length;i++) {
			var key = keys[i];
			if (key == "innerHTML")		e[key] = opts[key]
			else 											e.setAttributeNS(null, key, opts[key]);
		}
	}
	return e;
}

// Represents the diagram itself
Dugong.Diagram = function(elem){
	//HTML element the diagram is displayed in
	this.parentElement = elem;

	//SVG element
	this.svg = Dugong.e("svg");

	//Cause nodes to settle down. Specify a maximum number of iterations to avoid
	//infinite loops
	this.repulse = function(maxIterations) {
		if (maxIterations == null) maxIterations = 1;
		var nodes = this.nodes;

		for (var i=0;i<maxIterations;i++) {
			var currentEnergy = this.energy();
			this.eachNode(function(){ this.repulse(nodes) });
			if (currentEnergy == this.energy()) return;
		}
	}

	//Overall energy of the diagram, equal to sum of energy of
	//every node
	this.energy = function() {
		var totalEnergy = 0;
		var nodes = this.nodes;
		this.eachNode(function(){ totalEnergy += this.energy(nodes) });
		return totalEnergy;
	}

	//Redraw the diagram, by redrawing every node (and by extention every connector)
	this.redraw = function() { this.eachNode(function(){ this.redraw() }); }
	//Resize every node to fit its text
	this.resize = function() { this.eachNode(function(){ this.resize() }); }

	//Run a function on every node
	this.eachNode = function(fnc) { for (var i=0;i<this.nodes.length;i++) fnc.bind(this.nodes[i])(); }

	//Set svg viewbox to the appropriate size, based on contents and margin
	this.zoom = function() {
		var extents = {l:0,r:0,t:0,b:0};
		this.eachNode(function(){
			var centre = this.centre();
			if (centre.x < extents.l) extents.l = centre.x;
			if (centre.x > extents.r) extents.r = centre.x;
			if (centre.y < extents.t) extents.t = centre.y;
			if (centre.y > extents.b) extents.b = centre.y;
		});

		this.svg.setAttributeNS(null, "viewBox",
			(extents.l-Dugong.canvasMargin) + " " + (extents.t-Dugong.canvasMargin) + " " +
			(extents.r - extents.l + 2*Dugong.canvasMargin) + " " + (extents.b - extents.t + 2*Dugong.canvasMargin));
	}

	// Constructor

	//Base of everything else
	this.rootNode = null;
	//All nodes
	this.nodes = [];
	
	//Parse an indented list into a set of nodes with tree-like heirarchy
	var indentTree = {};

	var lines = elem.innerHTML.replace(/(^\s+|\s+$)/g,"").split("\n");
	var indentRegex = /^(\s+)(.*)/

	for (var i=0;i<lines.length;i++) {
		var line = lines[i];
	
		// Create node, assign to canvas
		var node = new Dugong.Node(line);
		this.nodes.push(node);
		if (!this.rootNode) this.rootNode = node;

		var indent = 0;
		var match = indentRegex.exec(line);
		if (match) {
			indent = match[1].length;
			node.name = match[2];
		}

		//Work out the best parent for this node. Best parent the node with the highest
		//indent which is less than this node. If multiple nodes, pick the last node created.
		var treeKeys = Object.keys(indentTree);
		var bestParent = null;
		var bestParentIndent = -1;
		for (var j=0;j<treeKeys.length;j++) {
			var key = treeKeys[j];
			if (key >= indent)
				delete indentTree[key];
			else if (key > bestParentIndent) {
				bestParentIndent = key;
				bestParent = indentTree[key];
			}
		}
		if (bestParent) bestParent.addChild(node);
		indentTree[indent] = node;
	}

	//Replace element's inner html with the svg
	elem.innerHTML = "";
	elem.appendChild(this.svg);
	var d = this;

	//Build elements
	this.eachNode(function(){ this.attachSkeleton(d) });
	this.eachNode(function(){ this.attachBoxes(d) });

	//Set to be the right size etc.
	this.zoom();
	this.redraw();
}

// A Node is a point on the SVG diagram. It keeps track of its position,
// energy, and can draw itself. So clever.
Dugong.Node = function(name) {
	//Name (inner html of node)
	this.name = name;

	//Node size
	this.height = Dugong.boxMinHeight;
	this.width = Dugong.boxMinHeight * Dugong.boxMinHeight * Dugong.boxRatio;

	//Children of the node itself
	this.children = [];

	//Parent node. If null, indicates node is root
	this.parent = null;

	this.g = Dugong.e("g");
	//The box the text fits into
	this.box = Dugong.e("rect", {rx: 12});
	this.g.appendChild(this.box);
	//The text, inside a div inside a foreignObject
	this.text = Dugong.e("foreignObject", {requiredExtentions: "http://www.w3.org/1999/xhtml"});
	this.g.appendChild(this.text);
	var foDiv = document.createElement("div");
	foDiv.innerHTML = this.name;
	this.text.appendChild(foDiv);

	//The connector line to the parent. Even root has one, hiding it under the box
	this.connector = Dugong.e("line", {stroke: "#000"});

	//Generation 0 is root, 1 is root's children, etc.
	this.generation = function() {
		if (this.parent == null) return 0;
		else return this.parent.generation() + 1;
	}

	//Position stuff
	this.centre = function() {
		if (this.parent == null) //Occurs at 0,0
			return new Dugong.Point(0,0);
		else { //Occurs at offset to parent
			var offset = Dugong.Point.fromAngleAndRadius(this.parent.angleTo(this), Dugong.stalkLength);
			return this.parent.centre().add(offset);
		}
	}

	//Build the connectors into a skeleton. Happens before boxes are drawn
	this.attachSkeleton = function(diagram) {
		diagram.svg.appendChild(this.connector);
	}

	//Draw the boxes onto the diagram
	this.attachBoxes = function(diagram) {
		diagram.svg.appendChild(this.g);
	}

	//Resize the element so text fits in the box
	this.resize = function() {
		var fObject = this.text;
		var div = fObject.childNodes[0];

		var currentHeight = Dugong.boxMinHeight;
		while (true) {
			fObject.setAttributeNS(null,"height", currentHeight - Dugong.boxMargin*2);
			fObject.setAttributeNS(null,"width", currentHeight*Dugong.boxRatio - Dugong.boxMargin*2);

			if (div.offsetHeight > (currentHeight - Dugong.boxMargin*2))
				currentHeight += 1;
			else
				break;
		}

		this.height = currentHeight;
		this.width = currentHeight * Dugong.boxRatio;
	}

	//Redraw all elements based on the node's centre.
	this.redraw = function() {
		var centre = this.centre();
		var halfWidth = this.width / 2;
		var halfHeight = this.height / 2;
		var generationClass = "gen-" + this.generation();

		this.g.setAttributeNS(null, "class", generationClass);
		
		this.box.setAttributeNS(null, "x", centre.x - halfWidth);
		this.box.setAttributeNS(null, "y", centre.y - halfHeight);
		this.box.setAttributeNS(null, "width", this.width);
		this.box.setAttributeNS(null, "height", this.height);

		this.text.setAttributeNS(null, "x", centre.x - halfWidth + Dugong.boxMargin);
		this.text.setAttributeNS(null, "y", centre.y - halfHeight + Dugong.boxMargin);
		this.text.setAttributeNS(null, "width", this.width - 2*Dugong.boxMargin);
		this.text.setAttributeNS(null, "height", this.height - 2*Dugong.boxMargin);

		this.connector.setAttributeNS(null, "x1", centre.x);
		this.connector.setAttributeNS(null, "y1", centre.y);
		if (this.parent) {
			var parentCentre = this.parent.centre();
			this.connector.setAttributeNS(null, "x2", parentCentre.x);
			this.connector.setAttributeNS(null, "y2", parentCentre.y);
		}
		else {
			this.connector.setAttributeNS(null, "x2", centre.x);
			this.connector.setAttributeNS(null, "y2", centre.y);	
		}
		this.connector.setAttributeNS(null, "class", generationClass);
	}

	//Add a child to the node, rearrange all children so they're equi-angled
	this.addChild = function(c) {
		c.parent = this;
		this.children.push({node: c, angle: 0});
		this.arrangeChildren();
	}

	//What's the angle from this node to one of its children?
	// Returns null if c is not a child of this node
	this.angleTo = function(c) {
		for (var i=0;i<this.children.length;i++) {
			var child = this.children[i];
			if (child.node == c) return child.angle;
		}
		return null;
	}

	//Arrange the children of this node in a little arc in front of it.
	this.arrangeChildren = function() {
		var arc = this.arc();
		var originAngle = 0;
		
		if (this.parent)
			originAngle = (this.parent.angleTo(this) - arc / 2) % (Math.PI*2);

		var arcPerChild = arc / this.children.length;
		originAngle += (arcPerChild / 2);

		for (var i=0;i<this.children.length;i++) {
			var child = this.children[i];
			var angle = (originAngle + arcPerChild * i) % (Math.PI*2);
			child.angle = angle;
			child.node.arrangeChildren();
		}
	}

	//The amount of a full circle that this node takes up.
	//Think of this as the "shadow" this node casts from the root node.
	this.arc = function() {
		if (this.parent)
			return this.parent.arc() / this.parent.children.length;
		else
			return Math.PI*2;
	}

	//Moves a child node around this node by a given amount in radians
	this.nudgeChild = function(child, amount) {
		for (var i=0;i<this.children.length;i++) {
			var c = this.children[i];
			if (c.node == child) {
				c.angle = c.angle + amount;
				return;
			}
		}
	}

	//Returns the energy of this node. A node's energy is proportional
	//to the number of other nodes close to it. If a value delta is provided,
	//the node will first be nudged by this amount.
	this.energy = function(nodes,delta) {
		if (this.parent == null) return 0;
		
		if (delta)
			this.parent.nudgeChild(this, delta);
		
		var totalEnergy = 0;
		var myCentre = this.centre();

		for (var i=0;i<nodes.length;i++) {
			if (nodes[i] == this) continue
			totalEnergy += 1 / myCentre.squaredDistanceTo(nodes[i].centre());
		}

		if (delta)
			this.parent.nudgeChild(this, -delta);

		return totalEnergy;
	}

	//Moves the node around trying to find the best (least energetic) spot
	//for it to be in.
	this.repulse = function(nodes) {
		if (this.parent == null) return;
		var lowestEnergy = this.energy(nodes);
		var bestNudge = 0;
		for (var nudge=-1;nudge<=1;nudge+=0.05) {
			var energy = this.energy(nodes, nudge);
			if (energy < lowestEnergy) {
				lowestEnergy = energy;
				bestNudge = nudge;
			}
		}

		if (bestNudge != 0)
			this.parent.nudgeChild(this, bestNudge);
	}
}

// The Point! An x,y point.
Dugong.Point = function(x,y) {
	this.x = x;
	this.y = y;

	//Add a point to another
	this.add = function(anotherPoint) {
		return new Dugong.Point(this.x + anotherPoint.x, this.y + anotherPoint.y);
	}

	//Returns the square of the distance between two points
	this.squaredDistanceTo = function(p) {
		return Math.pow(this.x - p.x,2) + Math.pow(this.y - p.y,2);
	}
}

//Create an x,y point given an angle and radius from 0,0
Dugong.Point.fromAngleAndRadius = function(t,r) {
	var x = r * Math.cos(t);
	var y = r * Math.sin(t);
	return new Dugong.Point(x,y);
}

//Populate. Call this method to start dugong working
Dugong.populate = function(klass) {
	window.addEventListener("load", function(){
		var dugongElements = document.getElementsByClassName(klass);
		for (var i=0;i<dugongElements.length;i++) {
			var diagram = new Dugong.Diagram(dugongElements[i]);
			diagram.resize();

			diagram.repulse(100);
			diagram.redraw();
			diagram.zoom();
		}
	},false);
}

