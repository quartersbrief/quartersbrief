var GameObject = require('$/src/model/gameobject');

describe('GameObject', function() {
	const TEST_DATA = { 
		prop1: 'string', 
		prop2: 123,
		nested: { prop3: 'prop3' },
		arr: [ 'prop4' ] 
	};

	it('should copy all properties from the source', function() {
		expect(new GameObject(TEST_DATA)).to.deep.equal(TEST_DATA);
	});

	describe('.set', function() {
		var obj;

		beforeEach(function() {
			obj = new GameObject(TEST_DATA);
		});

		it('should set existing top-level properties', function() {
			obj.set('prop1', 'newvalue');
			expect(obj.prop1).to.equal('newvalue');
		});

		it('should set new top-level properties', function() {
			obj.set('prop3', 'string');
			expect(obj).to
				.have.property('prop3')
				.that.equals('string');
		});

		it('should set nested properties with dot notation', function() {
			obj.set('nested.prop3', 'newvalue');
			expect(obj.nested.prop3).to.equal('newvalue');
		});

		it('should create missing intermediate level when setting nested properties', function(){
			obj.set('nested.morenested.prop', 'newvalue');
			expect(obj.nested).to
				.have.property('morenested');
			expect(obj.nested.morenested).to
				.have.property('prop')
				.that.equals('newvalue');
		});

		it('should set array array items with dot notation', function(){
			obj.set('arr.0', 'newvalue');
			expect(obj.arr).to.have.members(['newvalue']);
		});
	});

	describe('.get', function() {		
		it('should get top-level properties', function() {						
			for (key of Object.keys(TEST_DATA))
				expect(new GameObject(TEST_DATA).get(key)).to.equal(TEST_DATA[key]);
		});

		it('should get nested properties with dot notation', function() {
			expect(new GameObject(TEST_DATA).get('nested.prop3')).to.equal(TEST_DATA.nested.prop3);
		});

		it('should get array entries with dot notation', function() {
			expect(new GameObject(TEST_DATA).get('arr.0')).to.equal(TEST_DATA.arr[0]);
		});

		it('should return undefined if no such property exists', function() {
			var go = new GameObject(TEST_DATA);
			expect(go.get('doesnotexist')).to.be.undefined;
			expect(go.get('doesnotexist.withdotnotation')).to.be.undefined;
		})
	});
});