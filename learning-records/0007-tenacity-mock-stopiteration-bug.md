# Tenacity Decorator State Isolation & Mock Exhaustion

We discovered that static method decorators evaluate configurations at load-time, causing tenacity to ignore runtime instance-level overrides like `self.max_retries`. This mismatch triggered unexpected additional mock calls during unit testing, exhausting mock `side_effect` iterators and raising `StopIteration` errors. Designing wrappers with dynamically instantiated retriers at runtime resolves this state isolation leak and ensures predictable test coverage.
