// Infographics shown in Learn. Each one is a themed SVG in assets/diagrams/<id>.svg
// (it follows light/dark mode through the --ig-* colours in css/app.css).
// `h` is the drawing's height at 390 wide, used to reserve space while it loads.
// `services` / `compares` decide which Learn pages show it.

export const DIAGRAMS = [
  {
    id: 'vpc-layout', title: 'VPC layout', topic: 'Networking', h: 882,
    blurb: 'Inbound traffic reaches the app through the load balancer. Private servers reach the internet outbound-only, through a NAT gateway.',
    services: ['vpc'], compares: [],
  },
  {
    id: 'sg-nacl', title: 'Security group vs network ACL', topic: 'Security', h: 1132,
    blurb: 'Traffic from outside passes the NACL at the subnet edge, then the security group around the instance.',
    services: ['vpc'], compares: ['sgnacl'],
  },
  {
    id: 'load-balancers', title: 'Load balancers by layer', topic: 'Networking', h: 1074,
    blurb: 'Each Elastic Load Balancing type works at a different network layer. The layer decides what it can see and route on.',
    services: ['elb'], compares: ['elb'],
  },
  {
    id: 's3-classes', title: 'S3 storage classes', topic: 'Storage', h: 830,
    blurb: 'Each step down costs less to store and takes longer, or costs more, to retrieve.',
    services: ['s3'], compares: [],
  },
  {
    id: 'messaging', title: 'Messaging patterns', topic: 'Integration', h: 1231,
    blurb: 'Three ways to pass data between services: a queue, a topic that fans out, and a stream that keeps history.',
    services: ['sqs', 'sns', 'kinesis'], compares: ['messaging'],
  },
  {
    id: 'dr-strategies', title: 'Disaster recovery spectrum', topic: 'Resilience', h: 865,
    blurb: 'Each strategy keeps more running in the DR Region. Recovery gets faster and the bill gets bigger.',
    services: ['backup'], compares: ['dr'],
  },
];

export const diagramById = id => DIAGRAMS.find(d => d.id === id);
